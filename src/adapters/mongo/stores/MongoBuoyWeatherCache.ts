import { CacheStore, CacheHit } from '../../cache/ICacheStore'
import { BuoyWeather } from '../../../domain/entities/BuoyWeather'
import { BuoyQuery } from '../../../domain/repositories/IBuoyWeatherRepository'
import BuoyWeatherCacheModel from '../models/BuoyWeatherCacheModel'
import WindDirection from '../../../domain/value-objects/WindDirection';

// cachedAt = lúc ghi cache (dùng so TTL); updatedAt = lúc NDBC đo (trả client).
export default class MongoBuoyWeatherCache implements CacheStore<BuoyQuery, BuoyWeather> {
    public async read (query: BuoyQuery): Promise<CacheHit<BuoyWeather> | null> {
        const doc = await BuoyWeatherCacheModel.findOne({ buoyId: query.buoyId }).lean()
        if (!doc) return null
        const windDirection = WindDirection.from(doc.windDirection);
        return {
            value: {
                buoyId: doc.buoyId,
                windDirection: windDirection?.degrees ?? null,
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
