import { BuoyStation } from '../entities/BuoyStation'

export interface SyncStats {
    total: number
    created: number
    changed: number
    unchanged: number
}

export default interface BuoyStationSyncStore {
    upsertChanged(stations: BuoyStation[], now: Date): Promise<SyncStats>
}
