import assert from 'node:assert/strict'
import test from 'node:test'
import { getResponseMeta, recordDataSource, runWithResponseTrace } from '../src/observability/responseTrace'

test('reports cached data without claiming it was fetched for this request', async () => {
    const meta = await runWithResponseTrace(async () => {
        recordDataSource({
            source: 'weatherbit',
            status: 'cache',
            dataFetchedAt: '2026-07-29T04:00:00.000Z'
        })
        return getResponseMeta()
    })

    assert.equal(meta.dataSources.length, 1)
    assert.deepEqual(meta.dataSources[0], {
        source: 'weatherbit',
        status: 'cache',
        dataFetchedAt: '2026-07-29T04:00:00.000Z'
    })
    assert.match(meta.requestReceivedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(meta.responseSentAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(Number.isFinite(meta.processingMs), true)
})

test('reports an upstream refresh as data fetched for this request', async () => {
    const meta = await runWithResponseTrace(async () => {
        recordDataSource({
            source: 'ndbc',
            status: 'upstream',
            dataFetchedAt: '2026-07-29T04:10:00.000Z'
        })
        return getResponseMeta()
    })

    assert.deepEqual(meta.dataSources, [{
        source: 'ndbc',
        status: 'upstream',
        dataFetchedAt: '2026-07-29T04:10:00.000Z'
    }])
})
