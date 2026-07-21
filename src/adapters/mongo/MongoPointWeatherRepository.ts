import PointWeatherRepository from '../../domain/repositories/IPointWeatherRepository'
import {PointWeather, PointWeatherQuery} from '../../domain/entities/PointWeather'
import PointWeatherCacheModel from './models/PointWeatherCacheModel'

export default class MongoPointWeatherRepository implements PointWeatherRepository {
    constructor (
        private _inner: PointWeatherRepository,
        private _ttlMs: number
    ) {}

    public async getPointWeather (query: PointWeatherQuery): Promise<PointWeather> {
        const filter = {lat: query.lat, lon: query.lon}

        const doc = await PointWeatherCacheModel.findOne(filter).lean()

        if (doc && this._isFresh(doc.updatedAt)) {
            return {
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
            }
        }

        const fresh = await this._inner.getPointWeather(query)

        await PointWeatherCacheModel.findOneAndUpdate(
            filter,
            {$set: {
                windDirection: fresh.windDirection,
                windSpeed: fresh.windSpeed,
                gust: fresh.gust,
                waveHeight: fresh.waveHeight,
                atmospherePressure: fresh.atmospherePressure,
                temperature: fresh.temperature,
                waterTemp: fresh.waterTemp,
                visibility: fresh.visibility,
                owmUpdatedAt: fresh.updatedAt
            }},
            {upsert: true}
        )

        return fresh
    }

    private _isFresh (updatedAt?: Date): boolean {
        if (!updatedAt) return false
        return Date.now() - new Date(updatedAt).getTime() < this._ttlMs
    }
}
