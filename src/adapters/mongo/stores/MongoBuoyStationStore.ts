import type { AnyBulkWriteOperation } from 'mongoose'
import BuoyStationRepository from '../../../domain/repositories/IBuoyStationRepository'
import BuoyStationSyncStore, { SyncStats } from '../../../domain/repositories/IBuoyStationSyncStore'
import { BuoyStation } from '../../../domain/entities/BuoyStation'
import BuoyStationModel, { BuoyStationDoc } from '../models/BuoyStationModel'

// Ẩn trạm đã "chết" (biến mất khỏi feed lâu) khỏi bản đồ. lastSeenAt do bot cập
// nhật mỗi vòng; seed của API cũng set lastSeenAt=now.
const STALE_MS = 30 * 24 * 60 * 60 * 1000 // 30 ngày

// Doc do API ghi. Nếu một doc như vậy còn name null thì nó là PLACEHOLDER của bản
// cũ: lat/lon lấy từ query của client (sai vị trí trạm) và name chưa bao giờ được
// vá. Loại khỏi listAll -> vài chục doc rác không chặn fallback feed của /buoys.
const API_SOURCES = ['api-lazy-seed', 'api-cold-seed']

export default class MongoBuoyStationStore implements BuoyStationRepository, BuoyStationSyncStore {
    public async listAll(): Promise<BuoyStation[]> {
        const cutoff = new Date(Date.now() - STALE_MS)
        const docs = await BuoyStationModel
            .find(
                {
                    $and: [
                        { $or: [{ lastSeenAt: { $gte: cutoff } }, { lastSeenAt: { $exists: false } }] },
                        { $nor: [{ name: null, source: { $in: API_SOURCES } }] }
                    ]
                },
                { buoyId: 1, name: 1, lat: 1, lon: 1 }
            )
            .lean()

        return docs.map((d) => ({ buoyId: d.buoyId, name: d.name, lat: d.lat, lon: d.lon }))
    }

    public async findByBuoyId(buoyId: string): Promise<BuoyStation | null> {
        const doc = await BuoyStationModel
            .findOne({ buoyId }, { buoyId: 1, name: 1, lat: 1, lon: 1 })
            .lean()

        return doc ? { buoyId: doc.buoyId, name: doc.name, lat: doc.lat, lon: doc.lon } : null
    }

    public async saveFromFeed(station: BuoyStation): Promise<void> {
        await this._writeFeedStations([station], 'api-lazy-seed')
    }

    public async saveManyFromFeed(stations: BuoyStation[]): Promise<void> {
        await this._writeFeedStations(stations, 'api-cold-seed')
    }

    // 2 op cho mỗi trạm:
    //  1. $setOnInsert -> chỉ ghi khi CHƯA có buoyId; không đè name/lat/lon mà
    //     worker sync / bot đã crawl (đó mới là nguồn chuẩn của vị trí).
    //  2. Vá doc placeholder (filter name: null, cũng khớp doc thiếu field):
    //     name null = chưa writer chuẩn nào ghi -> lat/lon có thể là toạ độ
    //     client của bản cũ -> ghi lại theo feed. Bỏ op này khi feed cũng không
    //     có name (không có gì để vá).
    private async _writeFeedStations(stations: BuoyStation[], source: string): Promise<void> {
        if (stations.length === 0) return
        const now = new Date()
        const ops: AnyBulkWriteOperation<BuoyStationDoc>[] = []
        for (const station of stations) {
            ops.push({
                updateOne: {
                    filter: { buoyId: station.buoyId },
                    update: {
                        $setOnInsert: {
                            name: station.name,
                            lat: station.lat,
                            lon: station.lon,
                            source,
                            firstSeenAt: now,
                            lastSeenAt: now,
                            changedAt: now
                        }
                    },
                    upsert: true
                }
            })

            if (station.name === null) continue

            ops.push({
                updateOne: {
                    filter: { buoyId: station.buoyId, name: null },
                    update: {
                        $set: {
                            name: station.name,
                            lat: station.lat,
                            lon: station.lon,
                            source,
                            lastSeenAt: now,
                            changedAt: now
                        }
                    },
                    upsert: false
                }
            })
        }
        await BuoyStationModel.bulkWrite(ops, { ordered: false })
    }

    public async upsertChanged(stations: BuoyStation[], now: Date): Promise<SyncStats> {
        const existing = await BuoyStationModel
            .find({}, { buoyId: 1, name: 1, lat: 1, lon: 1 })
            .lean()
        const existingByBuoyId = new Map(existing.map((station) => [station.buoyId, station]))
        const stats: SyncStats = { total: stations.length, created: 0, changed: 0, unchanged: 0 }
        const ops: AnyBulkWriteOperation<BuoyStationDoc>[] = stations.map((station) => {
            const current = existingByBuoyId.get(station.buoyId)
            if (!current) {
                stats.created += 1
                return {
                    updateOne: {
                        filter: { buoyId: station.buoyId },
                        update: {
                            $set: {
                                name: station.name,
                                lat: station.lat,
                                lon: station.lon,
                                lastSeenAt: now,
                                changedAt: now
                            },
                            $setOnInsert: {
                                source: 'ndbc-activestations',
                                firstSeenAt: now
                            }
                        },
                        upsert: true
                    }
                }
            }

            if (current.name !== station.name || current.lat !== station.lat || current.lon !== station.lon) {
                stats.changed += 1
                return {
                    updateOne: {
                        filter: { buoyId: station.buoyId },
                        update: {
                            $set: {
                                name: station.name,
                                lat: station.lat,
                                lon: station.lon,
                                lastSeenAt: now,
                                changedAt: now
                            }
                        },
                        upsert: false
                    }
                }
            }

            stats.unchanged += 1
            return {
                updateOne: {
                    filter: { buoyId: station.buoyId },
                    update: { $set: { lastSeenAt: now } },
                    upsert: false
                }
            }
        })

        if (ops.length > 0) {
            await BuoyStationModel.bulkWrite(ops, { ordered: false })
        }
        return stats
    }
}
