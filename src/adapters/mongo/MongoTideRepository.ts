import TideRepository from '../../domain/repositories/ITideRepository'
import {TideChart, TideQuery} from '../../domain/entities/TideChart'
import TideChartCacheModel from './models/TideChartCacheModel'

export default class MongoTideRepository implements TideRepository {
    constructor (
        private _inner: TideRepository,
        private _ttlMs: number
    ) {}

    public async getTideChart (query: TideQuery): Promise<TideChart> {
        // Normalize giống hệt in-memory cũ: days/datum thiếu thì lấy mặc định —
        // phải khớp đúng giá trị adapter thật dùng để 2 request "tương đương"
        // trúng cùng 1 document cache.
        const days = query.days ?? 1
        const datum = query.datum ?? 'MLLW'
        const filter = {stationId: query.stationId, date: query.date, days, datum}

        const doc = await TideChartCacheModel.findOne(filter).lean()

        if (doc && this._isFresh(doc.updatedAt)) {
            return {
                stationId: doc.stationId,
                predictions: doc.predictions,
                highLow: doc.highLow
            }
        }

        const fresh = await this._inner.getTideChart(query)

        await TideChartCacheModel.findOneAndUpdate(
            filter,
            {$set: {predictions: fresh.predictions, highLow: fresh.highLow}},
            {upsert: true}
        )

        return fresh
    }

    // `updatedAt` do {timestamps: true} của Mongoose quản (Date lúc ghi cache).
    // Undefined chỉ xảy ra với document cực cũ tạo trước khi bật timestamps —
    // coi như hết hạn để buộc refetch.
    private _isFresh (updatedAt?: Date): boolean {
        if (!updatedAt) return false
        return Date.now() - new Date(updatedAt).getTime() < this._ttlMs
    }
}
