import BuoyWeatherRepository, { BuoyQuery } from '../../repositories/IBuoyWeatherRepository'
import { BuoyWeather } from '../../entities/BuoyWeather'
import { CacheStore, cacheAside } from './cacheAside'

export default class CachedBuoyWeatherRepository implements BuoyWeatherRepository {
    constructor (
        private _source: BuoyWeatherRepository,
        private _cache: CacheStore<BuoyQuery, BuoyWeather>,
        private _ttlMs: number
    ) {}

    public getBuoyWeather (query: BuoyQuery): Promise<BuoyWeather> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getBuoyWeather(query))
    }
}
