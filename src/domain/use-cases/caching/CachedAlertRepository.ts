import AlertRepository, { AlertQuery } from '../../repositories/IAlertRepository'
import { WeatherAlerts } from '../../entities/WeatherAlert'
import { CacheStore, cacheAside } from './cacheAside'

export default class CachedAlertRepository implements AlertRepository {
    constructor (
        private _source: AlertRepository,
        private _cache: CacheStore<AlertQuery, WeatherAlerts>,
        private _ttlMs: number
    ) {}

    public getAlerts (query: AlertQuery): Promise<WeatherAlerts> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getAlerts(query))
    }
}
