import AlertRepository from '../../domain/repositories/IAlertRepository'
import {WeatherAlerts, AlertQuery} from '../../domain/entities/WeatherAlert'
import WeatherAlertCacheModel from './models/WeatherAlertCacheModel'

export default class MongoAlertRepository implements AlertRepository {
    constructor (
        private _inner: AlertRepository,
        private _ttlMs: number
    ) {}

    public async getAlerts (query: AlertQuery): Promise<WeatherAlerts> {
        const filter = {lat: query.lat, lon: query.lon}

        const doc = await WeatherAlertCacheModel.findOne(filter).lean()

        if (doc && this._isFresh(doc.updatedAt)) {
            return {
                lat: doc.lat,
                lon: doc.lon,
                alerts: doc.alerts,
                updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : ''
            }
        }

        const fresh = await this._inner.getAlerts(query)

        await WeatherAlertCacheModel.findOneAndUpdate(
            filter,
            {$set: {alerts: fresh.alerts}},
            {upsert: true}
        )

        return fresh
    }

    private _isFresh (updatedAt?: Date): boolean {
        if (!updatedAt) return false
        return Date.now() - new Date(updatedAt).getTime() < this._ttlMs
    }
}
