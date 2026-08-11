import assert from 'node:assert/strict'
import test from 'node:test'
import BuoyStationModel from '../src/adapters/mongo/models/BuoyStationModel'
import MongoBuoyStationStore from '../src/adapters/mongo/stores/MongoBuoyStationStore'

test('writes changed and new stations while touching only lastSeenAt for unchanged stations', async (t) => {
    const model = BuoyStationModel as unknown as {
        find: () => { lean: () => Promise<unknown[]> }
        bulkWrite: (operations: unknown[], options: unknown) => Promise<unknown>
    }
    const originalFind = model.find
    const originalBulkWrite = model.bulkWrite
    let operations: unknown[] = []
    model.find = () => ({ lean: async () => [
        { buoyId: 'same', name: 'Stable', lat: 1, lon: 2 },
        { buoyId: 'changed', name: 'Old name', lat: 3, lon: 4 }
    ] })
    model.bulkWrite = async (input) => { operations = input }
    t.after(() => {
        model.find = originalFind
        model.bulkWrite = originalBulkWrite
    })
    const now = new Date('2026-08-11T00:00:00.000Z')

    const stats = await new MongoBuoyStationStore().upsertChanged([
        { buoyId: 'same', name: 'Stable', lat: 1, lon: 2 },
        { buoyId: 'changed', name: 'New name', lat: 3, lon: 4 },
        { buoyId: 'new', name: null, lat: 5, lon: 6 }
    ], now)

    assert.deepEqual(stats, { total: 3, created: 1, changed: 1, unchanged: 1 })
    assert.deepEqual(operations, [
        { updateOne: { filter: { buoyId: 'same' }, update: { $set: { lastSeenAt: now } }, upsert: false } },
        { updateOne: { filter: { buoyId: 'changed' }, update: { $set: { name: 'New name', lat: 3, lon: 4, lastSeenAt: now, changedAt: now } }, upsert: false } },
        { updateOne: { filter: { buoyId: 'new' }, update: { $set: { name: null, lat: 5, lon: 6, lastSeenAt: now, changedAt: now }, $setOnInsert: { source: 'ndbc', firstSeenAt: now } }, upsert: true } }
    ])
})
