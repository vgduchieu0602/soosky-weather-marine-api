// ============================================================================
// CachedTideRepository.ts — bọc source repo (NOAA) bằng cache-aside. Orchestration
// (còn tươi không / có refetch không) ở ĐÂY (use-case layer), không ở adapter Mongo.
// Implement ITideRepository nên use-case tổng hợp (buoy/point detail) vẫn dùng
// trong suốt, không cần biết có cache.
// ============================================================================

import TideRepository, { TideQuery } from '../../repositories/ITideRepository'
import { TideChart } from '../../entities/TideChart'
import { CacheStore, cacheAside } from './cacheAside'

export default class CachedTideRepository implements TideRepository {
    constructor (
        private _source: TideRepository,
        private _cache: CacheStore<TideQuery, TideChart>,
        private _ttlMs: number
    ) {}

    public getTideChart (query: TideQuery): Promise<TideChart> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getTideChart(query))
    }
}
