import assert from 'node:assert/strict'
import test from 'node:test'
import config from '../src/config'
import NdbcStationSource from '../src/adapters/ndbc/NdbcStationSource'

test('default API source makes one attempt with a 15-second timeout', async (t) => {
    const originalFetch = globalThis.fetch
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const originalTimeoutMs = config.ndbc.fetchTimeoutMs
    const originalRetries = config.ndbc.retries
    const timeoutDurations: number[] = []
    let attempts = 0
    globalThis.fetch = async () => {
        attempts += 1
        throw new Error('network unavailable')
    }
    globalThis.setTimeout = ((_callback: () => void, timeoutMs: number) => {
        timeoutDurations.push(timeoutMs)
        return 1 as unknown as NodeJS.Timeout
    }) as typeof setTimeout
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout
    config.ndbc.fetchTimeoutMs = 1
    config.ndbc.retries = 4
    t.after(() => {
        globalThis.fetch = originalFetch
        globalThis.setTimeout = originalSetTimeout
        globalThis.clearTimeout = originalClearTimeout
        config.ndbc.fetchTimeoutMs = originalTimeoutMs
        config.ndbc.retries = originalRetries
    })

    await assert.rejects(
        new NdbcStationSource().listActive(),
        /failed after 1 attempt: network unavailable/
    )

    assert.equal(attempts, 1)
    assert.deepEqual(timeoutDurations, [15000])
})

test('retries retryable failures with deterministic bounded exponential backoff', async (t) => {
    const originalFetch = globalThis.fetch
    const delays: number[] = []
    let attempts = 0
    globalThis.fetch = async () => {
        attempts += 1
        if (attempts < 4) throw new TypeError('fetch failed')
        return new Response('<stations><station id="46042" lat="36.785" lon="-122.398" name="MONTEREY" /></stations>')
    }
    t.after(() => { globalThis.fetch = originalFetch })

    const result = await new NdbcStationSource({
        url: 'https://example.test/activestations.xml',
        timeoutMs: 1,
        retries: 3,
        sleep: async (delayMs: number) => { delays.push(delayMs) }
    }).listActive()

    assert.deepEqual(result, [{ buoyId: '46042', name: 'MONTEREY', lat: 36.785, lon: -122.398 }])
    assert.equal(attempts, 4)
    assert.deepEqual(delays, [1000, 2000, 4000])
})

test('caps exponential retry backoff at 30 seconds', async (t) => {
    const originalFetch = globalThis.fetch
    const delays: number[] = []
    let attempts = 0
    globalThis.fetch = async () => {
        attempts += 1
        if (attempts < 8) throw new TypeError('fetch failed')
        return new Response('<stations><station id="retry-ok" lat="1" lon="2" name="Retry" /></stations>')
    }
    t.after(() => { globalThis.fetch = originalFetch })

    await new NdbcStationSource({
        url: 'https://example.test/activestations.xml',
        timeoutMs: 1,
        retries: 7,
        sleep: async (delayMs: number) => { delays.push(delayMs) }
    }).listActive()

    assert.equal(attempts, 8)
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000])
})

test('does not retry unexpected application errors', async (t) => {
    const originalFetch = globalThis.fetch
    let attempts = 0
    globalThis.fetch = async () => {
        attempts += 1
        throw new Error('invalid application state')
    }
    t.after(() => { globalThis.fetch = originalFetch })

    await assert.rejects(
        new NdbcStationSource({
            url: 'https://example.test/activestations.xml',
            timeoutMs: 1,
            retries: 3,
            sleep: async () => {}
        }).listActive(),
        /failed after 1 attempt: invalid application state/
    )

    assert.equal(attempts, 1)
})

test('rejects an invalid source URL before fetching', async (t) => {
    const originalFetch = globalThis.fetch
    let attempts = 0
    globalThis.fetch = async () => {
        attempts += 1
        return new Response('')
    }
    t.after(() => { globalThis.fetch = originalFetch })

    await assert.rejects(
        new NdbcStationSource({
            url: 'not a URL',
            timeoutMs: 1,
            retries: 3,
            sleep: async () => {}
        }).listActive(),
        /Invalid NDBC active-stations URL: not a URL/
    )

    assert.equal(attempts, 0)
})

test('retries HTTP 408, 429, and 5xx responses', async (t) => {
    const originalFetch = globalThis.fetch
    t.after(() => { globalThis.fetch = originalFetch })

    for (const status of [408, 429, 500, 503]) {
        let attempts = 0
        globalThis.fetch = async () => {
            attempts += 1
            return attempts === 1
                ? new Response('', { status })
                : new Response('<stations><station id="retry-ok" lat="1" lon="2" name="Retry" /></stations>')
        }

        const result = await new NdbcStationSource({
            url: 'https://example.test/activestations.xml',
            timeoutMs: 1,
            retries: 1,
            sleep: async () => {}
        }).listActive()

        assert.equal(attempts, 2, `HTTP ${status}`)
        assert.equal(result[0]?.buoyId, 'retry-ok')
    }
})

test('does not retry permanent HTTP responses', async (t) => {
    const originalFetch = globalThis.fetch
    t.after(() => { globalThis.fetch = originalFetch })

    for (const status of [400, 401, 403, 404]) {
        let attempts = 0
        globalThis.fetch = async () => {
            attempts += 1
            return new Response('', { status })
        }

        await assert.rejects(
            new NdbcStationSource({
                url: 'https://example.test/activestations.xml',
                timeoutMs: 1,
                retries: 3,
                sleep: async () => {}
            }).listActive(),
            new RegExp(`failed after 1 attempt: HTTP ${status}`)
        )
        assert.equal(attempts, 1, `HTTP ${status}`)
    }
})
