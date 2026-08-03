// ============================================================================
// CachedWeatherBitRepository.ts — decorator BESPOKE cho WeatherBit: 2 field lệch
// nhịp (humidity TTL ngắn, uvIndex TTL dài), mỗi field timestamp riêng. Tầng
// Interface Adapters. Logic merge/partial-write TRƯỚC nằm trong Mongo repo.
// ============================================================================

import WeatherBitRepository, { WeatherBitQuery } from '../../domain/repositories/IWeatherBitRepository'
import { WeatherBitCurrent } from '../../domain/entities/WeatherBitCurrent'
import { WeatherBitCacheStore, WeatherBitCacheEntry } from './IWeatherBitCacheStore'
import { isFresh } from './cacheAside'
import { recordDataSource } from '../../observability/responseTrace'

export default class CachedWeatherBitRepository implements WeatherBitRepository {
    constructor (
        private _source: WeatherBitRepository,
        private _cache: WeatherBitCacheStore,
        private _humidityTtlMs: number,
        private _uvTtlMs: number
    ) {}

    public async getWeatherBitCurrent (query: WeatherBitQuery): Promise<WeatherBitCurrent> {
        const entry = await this._cache.read(query)

        // TTL đo từ mốc GHI CACHE (*CachedAt), KHÔNG từ mốc quan trắc (*UpdatedAt):
        // ob_time của WeatherBit trễ 15-60 phút nên đo bằng nó sẽ làm cache hết hạn
        // ngay lúc vừa ghi -> mọi request đều đi upstream.
        const humidityFresh = !!entry && isFresh(entry.humidityCachedAt, this._humidityTtlMs)
        const uvFresh = !!entry && isFresh(entry.uvCachedAt, this._uvTtlMs)

        if (entry && humidityFresh && uvFresh) {
            recordDataSource({ source: 'weatherbit', status: 'cache', dataFetchedAt: entry.fetchedAt })
            return {
                lat: query.lat,
                lon: query.lon,
                temperature: entry.temperature,
                humidity: entry.humidity,
                dewPoint: entry.dewPoint,
                uvIndex: entry.uvIndex,
                updatedAt: entry.humidityUpdatedAt
            }
        }

        let fresh: WeatherBitCurrent
        try {
            fresh = await this._source.getWeatherBitCurrent(query)
        } catch (err) {
            recordDataSource({ source: 'weatherbit', status: 'unavailable', dataFetchedAt: null })
            throw err
        }
        const fetchedAt = new Date().toISOString()
        recordDataSource({ source: 'weatherbit', status: 'upstream', dataFetchedAt: fetchedAt })

        const patch: Partial<WeatherBitCacheEntry> = {}
        const temperature = humidityFresh ? entry!.temperature : fresh.temperature
        const humidity = humidityFresh ? entry!.humidity : fresh.humidity
        const dewPoint = humidityFresh ? entry!.dewPoint : fresh.dewPoint
        const humidityUpdatedAt = humidityFresh ? entry!.humidityUpdatedAt : fresh.updatedAt
        const uvIndex = uvFresh ? entry!.uvIndex : fresh.uvIndex

        if (!humidityFresh) {
            patch.fetchedAt = fetchedAt
            patch.temperature = fresh.temperature
            patch.humidity = fresh.humidity
            patch.dewPoint = fresh.dewPoint
            patch.humidityUpdatedAt = fresh.updatedAt
            patch.humidityCachedAt = fetchedAt
        }
        if (!uvFresh) {
            patch.uvIndex = fresh.uvIndex
            patch.uvUpdatedAt = fresh.updatedAt
            patch.uvCachedAt = fetchedAt
        }

        await this._cache.write(query, patch)

        return {
            lat: query.lat,
            lon: query.lon,
            temperature,
            humidity,
            dewPoint,
            uvIndex,
            updatedAt: humidityUpdatedAt
        }
    }
}
