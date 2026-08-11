import assert from 'node:assert/strict'
import test from 'node:test'
import NdbcStationSource from '../src/adapters/ndbc/NdbcStationSource'

test('NdbcStationSource configuration preserves zero retries', async (t) => {
    const originalRetries = process.env.NDBC_FETCH_RETRIES
    process.env.NDBC_FETCH_RETRIES = '0'
    t.after(() => {
        if (originalRetries === undefined) delete process.env.NDBC_FETCH_RETRIES
        else process.env.NDBC_FETCH_RETRIES = originalRetries
    })

    const { default: config } = await import(`../src/config.ts?retry-zero=${Date.now()}`)

    assert.equal(config.ndbc.retries, 0)
})

test('NdbcStationSource retries a failed active-stations request and returns the parsed station', async (t) => {
    const originalFetch = globalThis.fetch
    let attempts = 0
    globalThis.fetch = async () => {
        attempts += 1
        if (attempts === 1) throw new Error('temporary network failure')
        return new Response('<stations><station id="46042" lat="36.785" lon="-122.398" name="MONTEREY" /></stations>')
    }
    t.after(() => { globalThis.fetch = originalFetch })

    const result = await new NdbcStationSource({
        url: 'https://example.test/activestations.xml',
        timeoutMs: 1,
        retries: 1
    }).listActive()

    assert.deepEqual(result, [{ buoyId: '46042', name: 'MONTEREY', lat: 36.785, lon: -122.398 }])
    assert.equal(attempts, 2)
})
