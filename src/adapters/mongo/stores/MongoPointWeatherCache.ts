import { CacheStore, CacheHit } from '../../cache/ICacheStore'
import { PointWeather } from '../../../domain/entities/PointWeather'
import { PointWeatherQuery } from '../../../domain/repositories/IPointWeatherRepository'
import PointWeatherCacheModel from '../models/PointWeatherCacheModel'
import WindDirection from '../../../domain/value-objects/WindDirection';

// owmUpdatedAt = lúc OWM đo (trả client); updatedAt = lúc ghi cache (so TTL).
export default class MongoPointWeatherCache implements CacheStore<PointWeatherQuery, PointWeather> {
    public async read (query: PointWeatherQuery): Promise<CacheHit<PointWeather> | null> {
        const doc = await PointWeatherCacheModel.findOne({ lat: query.lat, lon: query.lon }).lean()
        if (!doc) return null
        const windDirection = WindDirection.from(doc.windDirection);
        return {
            value: {
                lat: doc.lat,
                lon: doc.lon,
                // Doc ghi TRƯỚC khi có 4 field này -> undefined; ép về null để
                // key luôn tồn tại (thiếu key sẽ KHÔNG thành "n/a" ở tầng HTTP).
                conditionCode: doc.conditionCode ?? null,
                conditionMain: doc.conditionMain ?? null,
                description: doc.description ?? null,
                icon: doc.icon ?? null,
                windDirection: windDirection?.degrees ?? null,
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
                conditionCode: value.conditionCode,
                conditionMain: value.conditionMain,
                description: value.description,
                icon: value.icon,
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
