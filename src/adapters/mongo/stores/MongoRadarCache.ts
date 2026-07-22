import { CacheStore, CacheHit } from '../../../domain/use-cases/caching/cacheAside'
import { RadarInfo } from '../../../domain/entities/RadarInfo'
import RadarCacheModel from '../models/RadarCacheModel'

const RADAR_KEY = 'radar'   //radar không có query -> 1 document duy nhất

// Query = void (radar toàn cục, không theo toạ độ).
export default class MongoRadarCache implements CacheStore<void, RadarInfo> {
    public async read (): Promise<CacheHit<RadarInfo> | null> {
        const doc = await RadarCacheModel.findOne({ key: RADAR_KEY }).lean()
        if (!doc) return null
        return {
            value: {
                host: doc.host,
                past: doc.past,
                nowcast: doc.nowcast,
                generatedAt: doc.generatedAt
            },
            freshAt: doc.updatedAt ?? null
        }
    }

    public async write (_query: void, value: RadarInfo): Promise<void> {
        await RadarCacheModel.findOneAndUpdate(
            { key: RADAR_KEY },
            { $set: {
                host: value.host,
                past: value.past,
                nowcast: value.nowcast,
                generatedAt: value.generatedAt
            } },
            { upsert: true }
        )
    }
}
