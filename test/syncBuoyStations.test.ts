import assert from 'node:assert/strict'
import test from 'node:test'
import type { BuoyStation } from '../src/domain/entities/BuoyStation'
import type BuoyStationSource from '../src/domain/repositories/IBuoyStationSource'
import type BuoyStationSyncStore from '../src/domain/repositories/IBuoyStationSyncStore'
import SyncBuoyStationsUseCase from '../src/domain/use-cases/buoy/SyncBuoyStationsUseCase'

test('rejects an empty source feed without writing', async () => {
    const source: BuoyStationSource = { listActive: async () => [] }
    let writes = 0
    const store: BuoyStationSyncStore = {
        upsertChanged: async () => {
            writes += 1
            return { total: 0, created: 0, changed: 0, unchanged: 0 }
        }
    }

    await assert.rejects(
        new SyncBuoyStationsUseCase(source, store).execute(),
        new Error('Source returned 0 stations')
    )
    assert.equal(writes, 0)
})

test('persists the source stations and returns writer stats', async () => {
    const stations: BuoyStation[] = [{ buoyId: '46042', name: 'MONTEREY', lat: 36.785, lon: -122.395 }]
    const source: BuoyStationSource = { listActive: async () => stations }
    let receivedStations: BuoyStation[] | undefined
    let receivedNow: Date | undefined
    const store: BuoyStationSyncStore = {
        upsertChanged: async (input, now) => {
            receivedStations = input
            receivedNow = now
            return { total: 1, created: 1, changed: 0, unchanged: 0 }
        }
    }

    const result = await new SyncBuoyStationsUseCase(source, store).execute()

    assert.deepEqual(receivedStations, stations)
    assert.ok(receivedNow instanceof Date)
    assert.deepEqual(result, { total: 1, created: 1, changed: 0, unchanged: 0 })
})
