import OwmForecastRepository, { OwmForecastQuery } from '../../domain/repositories/IOwmForecastRepository'
import { OwmForecast } from '../../domain/entities/OwmForecast'
import { CacheStore } from './ICacheStore'
import { cacheAside } from './cacheAside'

export default class CachedOwmForecastRepository implements OwmForecastRepository {
    constructor (
        private _source: OwmForecastRepository,
        private _cache: CacheStore<OwmForecastQuery, OwmForecast>,
        private _ttlMs: number
    ) {}

    public getForecast (query: OwmForecastQuery): Promise<OwmForecast> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getForecast(query))
    }
}
