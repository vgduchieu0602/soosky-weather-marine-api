import AlertRepository, { AlertQuery } from '../../domain/repositories/IAlertRepository'
import { WeatherAlerts } from '../../domain/entities/WeatherAlert'
import { CacheStore } from './ICacheStore'
import { cacheAside } from './cacheAside'

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
