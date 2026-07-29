import type { AnyBulkWriteOperation } from 'mongoose'
import BuoyStationRepository from '../../../domain/repositories/IBuoyStationRepository'
import { BuoyStation } from '../../../domain/entities/BuoyStation'
import BuoyStationModel, { BuoyStationDoc } from '../models/BuoyStationModel'

// Ẩn trạm đã "chết" (biến mất khỏi feed lâu) khỏi bản đồ. lastSeenAt do bot cập
// nhật mỗi vòng; lazy seed của API cũng set lastSeenAt=now.
const STALE_MS = 30 * 24 * 60 * 60 * 1000 // 30 ngày

export default class MongoBuoyStationStore implements BuoyStationRepository {
    public async listAll(): Promise<BuoyStation[]> {
        const cutoff = new Date(Date.now() - STALE_MS)
        const docs = await BuoyStationModel
            .find(
                { $or: [{ lastSeenAt: { $gte: cutoff } }, { lastSeenAt: { $exists: false } }] },
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

    public async seedIfAbsent(station: BuoyStation): Promise<void> {
        const now = new Date()
        // $setOnInsert only -> chỉ ghi khi CHƯA có buoyId; không đè name/lat/lon
        // mà bot đã crawl (bot mới là nguồn chuẩn của vị trí).
        await BuoyStationModel.updateOne(
            { buoyId: station.buoyId },
            {
                $setOnInsert: {
                    name: station.name,
                    lat: station.lat,
                    lon: station.lon,
                    source: 'api-lazy-seed',
                    firstSeenAt: now,
                    lastSeenAt: now,
                    changedAt: now
                }
            },
            { upsert: true }
        )
    }

    public async seedManyIfAbsent(stations: BuoyStation[]): Promise<void> {
        if (stations.length === 0) return
        const now = new Date()
        const ops: AnyBulkWriteOperation<BuoyStationDoc>[] = stations.map((s) => ({
            updateOne: {
                filter: { buoyId: s.buoyId },
                update: {
                    $setOnInsert: {
                        name: s.name,
                        lat: s.lat,
                        lon: s.lon,
                        source: 'api-cold-seed',
                        firstSeenAt: now,
                        lastSeenAt: now,
                        changedAt: now
                    }
                },
                upsert: true
            }
        }))
        await BuoyStationModel.bulkWrite(ops, { ordered: false })
    }
}
