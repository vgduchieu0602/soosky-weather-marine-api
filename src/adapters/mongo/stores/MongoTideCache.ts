// ============================================================================
// MongoTideCache.ts — cache store THUẦN cho tide (chỉ read/write 1 document).
// KHÔNG chứa logic TTL/refetch — đó là việc của use-case (cacheAside). Đây là
// chỗ duy nhất biết cú pháp Mongoose cho collection này.
// ============================================================================

import { CacheStore, CacheHit } from '../../../domain/use-cases/caching/cacheAside'
import { TideChart } from '../../../domain/entities/TideChart'
import { TideQuery } from '../../../domain/repositories/ITideRepository'
import TideChartCacheModel from '../models/TideChartCacheModel'

export default class MongoTideCache implements CacheStore<TideQuery, TideChart> {
    // Normalize days/datum về mặc định để 2 request "tương đương" trúng cùng document.
    private _filter (query: TideQuery) {
        return {
            stationId: query.stationId,
            date: query.date,
            days: query.days ?? 1,
            datum: query.datum ?? 'MLLW'
        }
    }

    public async read (query: TideQuery): Promise<CacheHit<TideChart> | null> {
        const doc = await TideChartCacheModel.findOne(this._filter(query)).lean()
        if (!doc) return null
        return {
            value: {
                stationId: doc.stationId,
                predictions: doc.predictions,
                highLow: doc.highLow
            },
            freshAt: doc.updatedAt ?? null
        }
    }

    public async write (query: TideQuery, value: TideChart): Promise<void> {
        await TideChartCacheModel.findOneAndUpdate(
            this._filter(query),
            { $set: { predictions: value.predictions, highLow: value.highLow } },
            { upsert: true }
        )
    }
}
