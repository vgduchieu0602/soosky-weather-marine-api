import BuoyStationSource from '../../domain/repositories/IBuoyStationSource'
import { BuoyStation } from '../../domain/entities/BuoyStation'

const TTL_MS = 24 * 60 * 60 * 1000;   // directory đổi chậm -> cache 24h

type Cache = { at: number; stations: BuoyStation[] } | null;

export default class InMemoryBuoyStationSource implements BuoyStationSource {
    private _cache: Cache = null;

    private _loading: Promise<BuoyStation[]> | null = null;

    constructor (private _inner: BuoyStationSource) {}

    public async listActive (): Promise<BuoyStation[]> {
        if (this._cache && Date.now() - this._cache.at < TTL_MS) return this._cache.stations;
        if (this._loading) return this._loading;

        this._loading = this._inner.listActive()
            .then((stations) => { this._cache = { at: Date.now(), stations }; return stations; })
            .catch((err) => {
                if (this._cache) {
                    console.warn(`[buoy-dir] refresh failed, serving stale cache: ${(err as Error)?.message ?? err}`);
                    return this._cache.stations;
                }
                throw err;
            })
            .finally(() => { this._loading = null; });

        return this._loading;
    }
}
