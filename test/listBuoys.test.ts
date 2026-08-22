import assert from 'node:assert/strict'
import test from 'node:test'
import ListBuoysUseCase from '../src/domain/use-cases/buoy/ListBuoysUseCase'

// /buoys: DB là nguồn chuẩn. DB rỗng (kể cả vì store đã loại doc placeholder) ->
// fallback activestations.xml + seed nền, best-effort.

const STATION = { buoyId: '41110', name: 'Masonboro Inlet', lat: 34.144, lon: -77.715 }

const flush = () => new Promise((resolve) => { setImmediate(resolve) })

function repoWith (listAll: () => Promise<unknown[]>) {
    const saved: unknown[][] = []
    return {
        listAll,
        saveManyFromFeed: async (stations: unknown[]) => { saved.push(stations) },
        saved
    }
}

test('returns the DB rows and never touches the feed when the DB has data', async () => {
    let calls = 0
    const repo = repoWith(async () => [STATION])
    const useCase = new ListBuoysUseCase(repo as any, { listActive: async () => { calls += 1; return [] } } as any)

    const result = await useCase.execute()

    assert.deepEqual(result, [STATION])
    assert.equal(calls, 0)
    assert.deepEqual(repo.saved, [])
})

test('falls back to the feed and seeds it in the background when the DB is empty', async () => {
    const repo = repoWith(async () => [])
    const useCase = new ListBuoysUseCase(repo as any, { listActive: async () => [STATION] } as any)

    const result = await useCase.execute()
    await flush()

    assert.deepEqual(result, [STATION])
    assert.deepEqual(repo.saved, [[STATION]])
})

test('returns an empty list instead of failing when the feed is down', async () => {
    const repo = repoWith(async () => [])
    const useCase = new ListBuoysUseCase(
        repo as any,
        { listActive: async () => { throw new Error('NDBC down') } } as any
    )

    const result = await useCase.execute()

    assert.deepEqual(result, [])
    assert.deepEqual(repo.saved, [])
})
