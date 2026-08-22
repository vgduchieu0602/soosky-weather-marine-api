import assert from 'node:assert/strict'
import test from 'node:test'
import InMemoryBuoyStationSource from '../src/adapters/cache/InMemoryBuoyStationSource'
import { BuoyStation } from '../src/domain/entities/BuoyStation'

const STATIONS: BuoyStation[] = [{ buoyId: '41110', name: 'Masonboro Inlet', lat: 34.144, lon: -77.715 }]

test('serves the cached directory instead of refetching', async () => {
    let calls = 0
    const source = new InMemoryBuoyStationSource({
        listActive: async () => { calls += 1; return STATIONS }
    })

    assert.deepEqual(await source.listActive(), STATIONS)
    assert.deepEqual(await source.listActive(), STATIONS)
    assert.equal(calls, 1)
})

test('collapses concurrent cold-cache calls into a single fetch', async () => {
    let calls = 0
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => { release = resolve })
    const source = new InMemoryBuoyStationSource({
        listActive: async () => { calls += 1; await gate; return STATIONS }
    })

    const both = Promise.all([source.listActive(), source.listActive()])
    release!()
    const [first, second] = await both

    assert.deepEqual(first, STATIONS)
    assert.deepEqual(second, STATIONS)
    assert.equal(calls, 1)
})

test('serves a stale cache when a refresh fails', async () => {
    let calls = 0
    const source = new InMemoryBuoyStationSource({
        listActive: async () => {
            calls += 1
            if (calls === 1) return STATIONS
            throw new Error('NDBC down')
        }
    })

    await source.listActive()
    // Ép hết hạn TTL để lần sau phải gọi lại upstream.
    ;(source as unknown as { _cache: { at: number } })._cache.at = 0

    assert.deepEqual(await source.listActive(), STATIONS)
    assert.equal(calls, 2)
})

test('rethrows when the first fetch fails and there is nothing cached', async () => {
    const source = new InMemoryBuoyStationSource({
        listActive: async () => { throw new Error('NDBC down') }
    })

    await assert.rejects(source.listActive(), /NDBC down/)
})
