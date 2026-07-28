import { WeatherBitCacheStore, WeatherBitCacheEntry } from '../../cache/IWeatherBitCacheStore'
import { WeatherBitQuery } from '../../../domain/repositories/IWeatherBitRepository'
import WeatherBitCacheModel from '../models/WeatherBitCacheModel'

// Store thuần: read cả 2 field + 2 timestamp; write partial (chỉ field truyền vào).
// Quyết định field nào hết hạn/ghi đè là ở CachedWeatherBitRepository (use-case).
export default class MongoWeatherBitCache implements WeatherBitCacheStore {
    public async read (query: WeatherBitQuery): Promise<WeatherBitCacheEntry | null> {
        const doc = await WeatherBitCacheModel.findOne({ lat: query.lat, lon: query.lon }).lean()
        if (!doc) return null
        return {
            humidity: doc.humidity,
            dewPoint: doc.dewPoint,
            humidityUpdatedAt: doc.humidityUpdatedAt,
            uvIndex: doc.uvIndex,
            uvUpdatedAt: doc.uvUpdatedAt
        }
    }

    public async write (query: WeatherBitQuery, patch: Partial<WeatherBitCacheEntry>): Promise<void> {
        await WeatherBitCacheModel.findOneAndUpdate(
            { lat: query.lat, lon: query.lon },
            { $set: patch },
            { upsert: true }
        )
    }
}
