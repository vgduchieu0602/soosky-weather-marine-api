// ============================================================================
// CachedWeatherBitRepository.ts — cache-aside BESPOKE cho WeatherBit: 2 field
// lệch nhịp (humidity TTL ngắn, uvIndex TTL dài), mỗi field timestamp riêng.
// Logic merge/partial-write này TRƯỚC nằm trong MongoWeatherBitRepository (adapter)
// -> đã move lên use-case; store Mongo giờ chỉ read/write thuần.
// ============================================================================

import WeatherBitRepository, { WeatherBitQuery } from '../../repositories/IWeatherBitRepository'
import { WeatherBitCurrent } from '../../entities/WeatherBitCurrent'
import { WeatherBitCacheStore, WeatherBitCacheEntry } from './IWeatherBitCacheStore'
import { isFresh } from './cacheAside'

export default class CachedWeatherBitRepository implements WeatherBitRepository {
    constructor (
        private _source: WeatherBitRepository,
        private _cache: WeatherBitCacheStore,
        private _humidityTtlMs: number,
        private _uvTtlMs: number
    ) {}

    public async getWeatherBitCurrent (query: WeatherBitQuery): Promise<WeatherBitCurrent> {
        const entry = await this._cache.read(query)

        const humidityFresh = !!entry && isFresh(entry.humidityUpdatedAt, this._humidityTtlMs)
        const uvFresh = !!entry && isFresh(entry.uvUpdatedAt, this._uvTtlMs)

        if (entry && humidityFresh && uvFresh) {
            return {
                lat: query.lat,
                lon: query.lon,
                humidity: entry.humidity,
                uvIndex: entry.uvIndex,
                updatedAt: entry.humidityUpdatedAt
            }
        }

        const fresh = await this._source.getWeatherBitCurrent(query)

        const patch: Partial<WeatherBitCacheEntry> = {}
        const humidity = humidityFresh ? entry!.humidity : fresh.humidity
        const humidityUpdatedAt = humidityFresh ? entry!.humidityUpdatedAt : fresh.updatedAt
        const uvIndex = uvFresh ? entry!.uvIndex : fresh.uvIndex

        if (!humidityFresh) {
            patch.humidity = fresh.humidity
            patch.humidityUpdatedAt = fresh.updatedAt
        }
        if (!uvFresh) {
            patch.uvIndex = fresh.uvIndex
            patch.uvUpdatedAt = fresh.updatedAt
        }

        await this._cache.write(query, patch)

        return {
            lat: query.lat,
            lon: query.lon,
            humidity,
            uvIndex,
            updatedAt: humidityUpdatedAt
        }
    }
}
