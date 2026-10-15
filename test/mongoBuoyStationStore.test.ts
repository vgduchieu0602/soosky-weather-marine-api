import assert from 'node:assert/strict'
import test from 'node:test'
import BuoyStationModel from '../src/adapters/mongo/models/BuoyStationModel'
import MongoBuoyStationStore from '../src/adapters/mongo/stores/MongoBuoyStationStore'

// Doc "placeholder" = name null + source do API ghi (bản cũ lazy seed toạ độ
// CLIENT với name: null). Vị trí sai + không có tên -> phải bị loại khỏi listAll
// (nếu không, vài chục doc rác chặn fallback activestations.xml của /buoys) và
// phải được vá lại khi API đọc được data thật từ feed.

type ModelStub = {
    find: (filter?: unknown, projection?: unknown) => { lean: () => Promise<unknown[]> }
    bulkWrite: (operations: unknown[], options?: unknown) => Promise<unknown>
}

function stubModel (t: { after: (fn: () => void) => void }): {
    filters: unknown[]
    operations: unknown[]
} {
    const model = BuoyStationModel as unknown as ModelStub
    const originalFind = model.find
    const originalBulkWrite = model.bulkWrite
    const filters: unknown[] = []
    const operations: unknown[] = []
    model.find = (filter) => { filters.push(filter); return { lean: async () => [] } }
    model.bulkWrite = async (input) => { operations.push(...input) }
    t.after(() => {
        model.find = originalFind
        model.bulkWrite = originalBulkWrite
    })
    return { filters, operations }
}

test('listAll excludes API placeholder documents so they cannot block the feed fallback', async (t) => {
    const { filters } = stubModel(t)

    await new MongoBuoyStationStore().listAll()

    const filter = filters[0] as { $and: unknown[] }
    assert.ok(Array.isArray(filter.$and), 'filter must combine staleness + placeholder rules')
    assert.deepEqual(filter.$and[1], {
        $nor: [{ name: null, source: { $in: ['api-lazy-seed', 'api-cold-seed'] } }]
    })
})

test('saveFromFeed inserts the station and repairs an existing placeholder', async (t) => {
    const { operations } = stubModel(t)

    await new MongoBuoyStationStore().saveFromFeed({
        buoyId: '41110', name: 'Masonboro Inlet', lat: 34.144, lon: -77.715
    })

    assert.equal(operations.length, 2)
    const insert = operations[0] as { updateOne: { filter: unknown; update: any; upsert: boolean } }
    assert.deepEqual(insert.updateOne.filter, { buoyId: '41110' })
    assert.equal(insert.updateOne.upsert, true)
    assert.equal(insert.updateOne.update.$setOnInsert.name, 'Masonboro Inlet')
    assert.equal(insert.updateOne.update.$setOnInsert.source, 'api-lazy-seed')
    assert.equal(insert.updateOne.update.$set, undefined, 'never overwrite the sync writer data')

    const repair = operations[1] as { updateOne: { filter: unknown; update: any; upsert: boolean } }
    assert.deepEqual(repair.updateOne.filter, { buoyId: '41110', name: null })
    assert.equal(repair.updateOne.upsert, false)
    assert.equal(repair.updateOne.update.$set.name, 'Masonboro Inlet')
    assert.equal(repair.updateOne.update.$set.lat, 34.144)
    assert.equal(repair.updateOne.update.$set.lon, -77.715)
})

test('saveManyFromFeed skips the repair operation for stations the feed cannot name', async (t) => {
    const { operations } = stubModel(t)

    await new MongoBuoyStationStore().saveManyFromFeed([
        { buoyId: 'named', name: 'Nantucket', lat: 1, lon: 2 },
        { buoyId: 'nameless', name: null, lat: 3, lon: 4 }
    ])

    const filters = operations.map((op) => (op as { updateOne: { filter: unknown } }).updateOne.filter)
    assert.deepEqual(filters, [
        { buoyId: 'named' },
        { buoyId: 'named', name: null },
        { buoyId: 'nameless' }
    ])
    const inserted = operations[0] as { updateOne: { update: any } }
    assert.equal(inserted.updateOne.update.$setOnInsert.source, 'api-cold-seed')
})

test('saveManyFromFeed writes nothing for an empty list', async (t) => {
    const { operations } = stubModel(t)

    await new MongoBuoyStationStore().saveManyFromFeed([])

    assert.equal(operations.length, 0)
})
