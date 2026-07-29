import RadarRepository from '../../domain/repositories/IRadarRepository'
import { RadarInfo } from '../../domain/entities/RadarInfo'
import { CacheStore } from './ICacheStore'
import { cacheAside } from './cacheAside'

export default class CachedRadarRepository implements RadarRepository {
    constructor (
        private _source: RadarRepository,
        private _cache: CacheStore<void, RadarInfo>,
        private _ttlMs: number
    ) {}

    public getRadarInfo (): Promise<RadarInfo> {
        return cacheAside(this._cache, undefined, this._ttlMs, () => this._source.getRadarInfo(), 'rainviewer')
    }
}
