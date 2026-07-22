import { CacheStore, CacheHit } from '../../../domain/use-cases/caching/cacheAside'
import { OwmForecast } from '../../../domain/entities/OwmForecast'
import { OwmForecastQuery } from '../../../domain/repositories/IOwmForecastRepository'
import OwmForecastCacheModel from '../models/OwmForecastCacheModel'

export default class MongoOwmForecastCache implements CacheStore<OwmForecastQuery, OwmForecast> {
    public async read (query: OwmForecastQuery): Promise<CacheHit<OwmForecast> | null> {
        const doc = await OwmForecastCacheModel.findOne({ lat: query.lat, lon: query.lon }).lean()
        if (!doc) return null
        return {
            value: {
                lat: doc.lat,
                lon: doc.lon,
                hourly: doc.hourly,
                daily: doc.daily,
                updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : ''
            },
            freshAt: doc.updatedAt ?? null
        }
    }

    public async write (query: OwmForecastQuery, value: OwmForecast): Promise<void> {
        await OwmForecastCacheModel.findOneAndUpdate(
            { lat: query.lat, lon: query.lon },
            { $set: { hourly: value.hourly, daily: value.daily } },
            { upsert: true }
        )
    }
}
