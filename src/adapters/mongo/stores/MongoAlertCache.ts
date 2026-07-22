import { CacheStore, CacheHit } from '../../../domain/use-cases/caching/cacheAside'
import { WeatherAlerts } from '../../../domain/entities/WeatherAlert'
import { AlertQuery } from '../../../domain/repositories/IAlertRepository'
import WeatherAlertCacheModel from '../models/WeatherAlertCacheModel'

export default class MongoAlertCache implements CacheStore<AlertQuery, WeatherAlerts> {
    public async read (query: AlertQuery): Promise<CacheHit<WeatherAlerts> | null> {
        const doc = await WeatherAlertCacheModel.findOne({ lat: query.lat, lon: query.lon }).lean()
        if (!doc) return null
        return {
            value: {
                lat: doc.lat,
                lon: doc.lon,
                alerts: doc.alerts,
                updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : ''
            },
            freshAt: doc.updatedAt ?? null
        }
    }

    public async write (query: AlertQuery, value: WeatherAlerts): Promise<void> {
        await WeatherAlertCacheModel.findOneAndUpdate(
            { lat: query.lat, lon: query.lon },
            { $set: { alerts: value.alerts } },
            { upsert: true }
        )
    }
}
