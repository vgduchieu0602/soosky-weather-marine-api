import PointWeatherRepository, { PointWeatherQuery } from '../../domain/repositories/IPointWeatherRepository'
import { PointWeather } from '../../domain/entities/PointWeather'
import { CacheStore } from './ICacheStore'
import { cacheAside } from './cacheAside'

export default class CachedPointWeatherRepository implements PointWeatherRepository {
    constructor (
        private _source: PointWeatherRepository,
        private _cache: CacheStore<PointWeatherQuery, PointWeather>,
        private _ttlMs: number
    ) {}

    public getPointWeather (query: PointWeatherQuery): Promise<PointWeather> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getPointWeather(query))
    }
}
