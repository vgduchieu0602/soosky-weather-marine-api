import BuoyWeatherRepository, { BuoyQuery } from '../../domain/repositories/IBuoyWeatherRepository'
import { BuoyWeather } from '../../domain/entities/BuoyWeather'
import { CacheStore } from './ICacheStore'
import { cacheAside } from './cacheAside'

export default class CachedBuoyWeatherRepository implements BuoyWeatherRepository {
    constructor (
        private _source: BuoyWeatherRepository,
        private _cache: CacheStore<BuoyQuery, BuoyWeather>,
        private _ttlMs: number
    ) {}

    public getBuoyWeather (query: BuoyQuery): Promise<BuoyWeather> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getBuoyWeather(query), 'ndbc')
    }
}
