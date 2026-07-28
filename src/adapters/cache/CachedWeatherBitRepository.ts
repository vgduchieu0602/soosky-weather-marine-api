// ============================================================================
// CachedWeatherBitRepository.ts — decorator BESPOKE cho WeatherBit: 2 field lệch
// nhịp (humidity TTL ngắn, uvIndex TTL dài), mỗi field timestamp riêng. Tầng
// Interface Adapters. Logic merge/partial-write TRƯỚC nằm trong Mongo repo.
// ============================================================================

import WeatherBitRepository, { WeatherBitQuery } from '../../domain/repositories/IWeatherBitRepository'
import { WeatherBitCurrent } from '../../domain/entities/WeatherBitCurrent'
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
                dewPoint: entry.dewPoint,
                uvIndex: entry.uvIndex,
                updatedAt: entry.humidityUpdatedAt
            }
        }

        const fresh = await this._source.getWeatherBitCurrent(query)

        const patch: Partial<WeatherBitCacheEntry> = {}
        const humidity = humidityFresh ? entry!.humidity : fresh.humidity
        const dewPoint = humidityFresh ? entry!.dewPoint : fresh.dewPoint
        const humidityUpdatedAt = humidityFresh ? entry!.humidityUpdatedAt : fresh.updatedAt
        const uvIndex = uvFresh ? entry!.uvIndex : fresh.uvIndex

        if (!humidityFresh) {
            patch.humidity = fresh.humidity
            patch.dewPoint = fresh.dewPoint
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
            dewPoint,
            uvIndex,
            updatedAt: humidityUpdatedAt
        }
    }
}
