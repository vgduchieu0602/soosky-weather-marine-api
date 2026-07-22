import { CacheStore, CacheHit } from '../../cache/ICacheStore'
import { PointWeather } from '../../../domain/entities/PointWeather'
import { PointWeatherQuery } from '../../../domain/repositories/IPointWeatherRepository'
import PointWeatherCacheModel from '../models/PointWeatherCacheModel'

// owmUpdatedAt = lúc OWM đo (trả client); updatedAt = lúc ghi cache (so TTL).
export default class MongoPointWeatherCache implements CacheStore<PointWeatherQuery, PointWeather> {
    public async read (query: PointWeatherQuery): Promise<CacheHit<PointWeather> | null> {
        const doc = await PointWeatherCacheModel.findOne({ lat: query.lat, lon: query.lon }).lean()
        if (!doc) return null
        return {
            value: {
                lat: doc.lat,
                lon: doc.lon,
                windDirection: doc.windDirection,
                windSpeed: doc.windSpeed,
                gust: doc.gust,
                waveHeight: doc.waveHeight,
                atmospherePressure: doc.atmospherePressure,
                temperature: doc.temperature,
                waterTemp: doc.waterTemp,
                visibility: doc.visibility,
                updatedAt: doc.owmUpdatedAt
            },
            freshAt: doc.updatedAt ?? null
        }
    }

    public async write (query: PointWeatherQuery, value: PointWeather): Promise<void> {
        await PointWeatherCacheModel.findOneAndUpdate(
            { lat: query.lat, lon: query.lon },
            { $set: {
                windDirection: value.windDirection,
                windSpeed: value.windSpeed,
                gust: value.gust,
                waveHeight: value.waveHeight,
                atmospherePressure: value.atmospherePressure,
                temperature: value.temperature,
                waterTemp: value.waterTemp,
                visibility: value.visibility,
                owmUpdatedAt: value.updatedAt
            } },
            { upsert: true }
        )
    }
}
