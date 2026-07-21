import WeatherBitRepository from '../../domain/repositories/IWeatherBitRepository'
import {WeatherBitCurrent, WeatherBitQuery} from '../../domain/entities/WeatherBitCurrent'
import WeatherBitCacheModel from './models/WeatherBitCacheModel'

export default class MongoWeatherBitRepository implements WeatherBitRepository {
    constructor (
        private _inner: WeatherBitRepository,
        private _humidityTtlMs: number,
        private _uvTtlMs: number
    ) {}

    public async getWeatherBitCurrent (query: WeatherBitQuery): Promise<WeatherBitCurrent> {
        const filter = {lat: query.lat, lon: query.lon}

        const doc = await WeatherBitCacheModel.findOne(filter).lean()

        const humidityFresh = !!doc && this._isFresh(doc.humidityUpdatedAt, this._humidityTtlMs)
        const uvFresh = !!doc && this._isFresh(doc.uvUpdatedAt, this._uvTtlMs)

        if (doc && humidityFresh && uvFresh) {
            return {
                lat: doc.lat,
                lon: doc.lon,
                humidity: doc.humidity,
                uvIndex: doc.uvIndex,
                updatedAt: doc.humidityUpdatedAt
            }
        }

        const fresh = await this._inner.getWeatherBitCurrent(query)

        const set: Record<string, number | null | string> = {}
        const humidity = humidityFresh ? doc!.humidity : fresh.humidity
        const humidityUpdatedAt = humidityFresh ? doc!.humidityUpdatedAt : fresh.updatedAt
        const uvIndex = uvFresh ? doc!.uvIndex : fresh.uvIndex
        const uvUpdatedAt = uvFresh ? doc!.uvUpdatedAt : fresh.updatedAt

        if (!humidityFresh) {
            set.humidity = fresh.humidity
            set.humidityUpdatedAt = fresh.updatedAt
        }
        if (!uvFresh) {
            set.uvIndex = fresh.uvIndex
            set.uvUpdatedAt = fresh.updatedAt
        }

        await WeatherBitCacheModel.findOneAndUpdate(filter, {$set: set}, {upsert: true})

        return {
            lat: query.lat,
            lon: query.lon,
            humidity,
            uvIndex,
            updatedAt: humidityUpdatedAt
        }
    }

    private _isFresh (updatedAt: string | undefined, ttlMs: number): boolean {
        if (!updatedAt) return false
        return Date.now() - new Date(updatedAt).getTime() < ttlMs
    }
}
