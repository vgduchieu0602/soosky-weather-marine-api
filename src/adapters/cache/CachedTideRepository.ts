// ============================================================================
// CachedTideRepository.ts — repository decorator (Interface Adapters). Bọc source
// (NOAA) + cache store bằng cache-aside. Implement ITideRepository nên use-case
// dùng trong suốt, không biết có cache. KHÔNG phải use-case: chỉ là hạ tầng cache.
// ============================================================================

import TideRepository, { TideQuery } from '../../domain/repositories/ITideRepository'
import { TideChart } from '../../domain/entities/TideChart'
import { CacheStore } from './ICacheStore'
import { cacheAside } from './cacheAside'

export default class CachedTideRepository implements TideRepository {
    constructor (
        private _source: TideRepository,
        private _cache: CacheStore<TideQuery, TideChart>,
        private _ttlMs: number
    ) {}

    public getTideChart (query: TideQuery): Promise<TideChart> {
        return cacheAside(this._cache, query, this._ttlMs, () => this._source.getTideChart(query), 'noaa-tide')
    }
}
