import BuoyStationSource from '../../repositories/IBuoyStationSource'
import BuoyStationSyncStore, { SyncStats } from '../../repositories/IBuoyStationSyncStore'

export default class SyncBuoyStationsUseCase {
    public constructor(
        private readonly _source: BuoyStationSource,
        private readonly _store: BuoyStationSyncStore
    ) {}

    public async execute(): Promise<SyncStats> {
        const stations = await this._source.listActive()
        if (stations.length === 0) {
            throw new Error('Source returned 0 stations')
        }

        return this._store.upsertChanged(stations, new Date())
    }
}
