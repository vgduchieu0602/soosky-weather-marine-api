import { CacheStore, CacheHit } from '../../../domain/use-cases/caching/cacheAside'
import { BuoyWeather } from '../../../domain/entities/BuoyWeather'
import { BuoyQuery } from '../../../domain/repositories/IBuoyWeatherRepository'
import BuoyWeatherCacheModel from '../models/BuoyWeatherCacheModel'

// cachedAt = lúc ghi cache (dùng so TTL); updatedAt = lúc NDBC đo (trả client).
export default class MongoBuoyWeatherCache implements CacheStore<BuoyQuery, BuoyWeather> {
    public async read (query: BuoyQuery): Promise<CacheHit<BuoyWeather> | null> {
        const doc = await BuoyWeatherCacheModel.findOne({ buoyId: query.buoyId }).lean()
        if (!doc) return null
        return {
            value: {
                buoyId: doc.buoyId,
                windDirection: doc.windDirection,
                windSpeed: doc.windSpeed,
                gust: doc.gust,
                waveHeight: doc.waveHeight,
                atmospherePressure: doc.atmospherePressure,
                temperature: doc.temperature,
                waterTemp: doc.waterTemp,
                visibility: doc.visibility,
                updatedAt: doc.updatedAt
            },
            freshAt: doc.cachedAt ?? null
        }
    }

    public async write (query: BuoyQuery, value: BuoyWeather): Promise<void> {
        await BuoyWeatherCacheModel.findOneAndUpdate(
            { buoyId: query.buoyId },
            { $set: value },
            { upsert: true }
        )
    }
}
