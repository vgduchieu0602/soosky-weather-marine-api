import PointWeatherRepository, { PointWeatherQuery } from '../../repositories/IPointWeatherRepository'
import { PointWeather } from '../../entities/PointWeather'
import { CacheStore, cacheAside } from './cacheAside'

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
