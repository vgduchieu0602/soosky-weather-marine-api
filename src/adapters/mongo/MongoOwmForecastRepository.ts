import OwmForecastRepository from '../../domain/repositories/IOwmForecastRepository'
import {OwmForecast, OwmForecastQuery} from '../../domain/entities/OwmForecast'
import OwmForecastCacheModel from './models/OwmForecastCacheModel'

export default class MongoOwmForecastRepository implements OwmForecastRepository {
    constructor (
        private _inner: OwmForecastRepository,
        private _ttlMs: number
    ) {}

    public async getForecast (query: OwmForecastQuery): Promise<OwmForecast> {
        const filter = {lat: query.lat, lon: query.lon}

        const doc = await OwmForecastCacheModel.findOne(filter).lean()

        if (doc && this._isFresh(doc.updatedAt)) {
            return {
                lat: doc.lat,
                lon: doc.lon,
                hourly: doc.hourly,
                daily: doc.daily,
                updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : ''
            }
        }

        const fresh = await this._inner.getForecast(query)

        await OwmForecastCacheModel.findOneAndUpdate(
            filter,
            {$set: {hourly: fresh.hourly, daily: fresh.daily}},
            {upsert: true}
        )

        return fresh
    }

    private _isFresh (updatedAt?: Date): boolean {
        if (!updatedAt) return false
        return Date.now() - new Date(updatedAt).getTime() < this._ttlMs
    }
}
