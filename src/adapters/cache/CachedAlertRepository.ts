import AlertRepository, { AlertQuery } from '../../domain/repositories/IAlertRepository'
import { WeatherAlerts } from '../../domain/entities/WeatherAlert'
import { CacheStore } from './ICacheStore'
import { cacheAside } from './cacheAside'

const EMPTY_ALERT_TTL_MS = 3 * 60 * 1000

export default class CachedAlertRepository implements AlertRepository {
    constructor (
        private _source: AlertRepository,
        private _cache: CacheStore<AlertQuery, WeatherAlerts>,
        private _ttlMs: number
    ) {}

    public getAlerts (query: AlertQuery): Promise<WeatherAlerts> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getAlerts(query), 'weatherbit-alerts', {
            // Cảnh báo mới có thể được ban hành sau khi điểm này vừa nhận [].
            ttlMsForValue: (value) => value.alerts.length === 0 ? EMPTY_ALERT_TTL_MS : this._ttlMs
        })
    }
}
