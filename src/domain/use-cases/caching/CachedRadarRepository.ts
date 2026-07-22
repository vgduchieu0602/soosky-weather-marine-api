import RadarRepository from '../../repositories/IRadarRepository'
import { RadarInfo } from '../../entities/RadarInfo'
import { CacheStore, cacheAside } from './cacheAside'

export default class CachedRadarRepository implements RadarRepository {
    constructor (
        private _source: RadarRepository,
        private _cache: CacheStore<void, RadarInfo>,
        private _ttlMs: number
    ) {}

    public getRadarInfo (): Promise<RadarInfo> {
        return cacheAside(this._cache, undefined, this._ttlMs, () => this._source.getRadarInfo())
    }
}
