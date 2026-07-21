import RadarRepository from '../../domain/repositories/IRadarRepository'
import {RadarInfo} from '../../domain/entities/RadarInfo'
import RadarCacheModel from './models/RadarCacheModel'

const RADAR_KEY = 'radar'

export default class MongoRadarRepository implements RadarRepository {
    constructor (
        private _inner: RadarRepository,
        private _ttlMs: number
    ) {}

    public async getRadarInfo (): Promise<RadarInfo> {
        const doc = await RadarCacheModel.findOne({key: RADAR_KEY}).lean()

        if (doc && this._isFresh(doc.updatedAt)) {
            return {
                host: doc.host,
                past: doc.past,
                nowcast: doc.nowcast,
                generatedAt: doc.generatedAt
            }
        }

        const fresh = await this._inner.getRadarInfo()

        await RadarCacheModel.findOneAndUpdate(
            {key: RADAR_KEY},
            {$set: {
                host: fresh.host,
                past: fresh.past,
                nowcast: fresh.nowcast,
                generatedAt: fresh.generatedAt
            }},
            {upsert: true}
        )

        return fresh
    }

    private _isFresh (updatedAt?: Date): boolean {
        if (!updatedAt) return false
        return Date.now() - new Date(updatedAt).getTime() < this._ttlMs
    }
}
