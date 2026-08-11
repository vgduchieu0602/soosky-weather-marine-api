import assert from 'node:assert/strict'
import test from 'node:test'
import CachedAlertRepository from '../src/adapters/cache/CachedAlertRepository'
import { WeatherAlerts } from '../src/domain/entities/WeatherAlert'

const THREE_MINUTES = 3 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000
const query = { lat: 34.0522, lon: -118.2437 }

function weatherAlerts (alerts: WeatherAlerts['alerts']): WeatherAlerts {
    return { ...query, alerts, updatedAt: new Date().toISOString() }
}

function fakeStore (value: WeatherAlerts, freshAt: Date) {
    return {
        read: async () => ({ value, freshAt }),
        write: async () => undefined
    }
}

test('refreshes an empty alert cache after three minutes', async () => {
    let upstreamCalls = 0
    const source = {
        getAlerts: async () => {
            upstreamCalls += 1
            return weatherAlerts([{ title: 'New advisory', severity: 'Advisory', regions: [], onsetLocal: null, endsLocal: null }])
        }
    } as any
    const repo = new CachedAlertRepository(
        source,
        fakeStore(weatherAlerts([]), new Date(Date.now() - THREE_MINUTES - 1)) as any,
        THIRTY_MINUTES
    )

    const result = await repo.getAlerts(query)

    assert.equal(upstreamCalls, 1)
    assert.equal(result.alerts.length, 1)
})

test('keeps an alert-bearing cache for thirty minutes', async () => {
    let upstreamCalls = 0
    const cached = weatherAlerts([{ title: 'Cached advisory', severity: 'Advisory', regions: [], onsetLocal: null, endsLocal: null }])
    const source = {
        getAlerts: async () => {
            upstreamCalls += 1
            return weatherAlerts([])
        }
    } as any
    const repo = new CachedAlertRepository(
        source,
        fakeStore(cached, new Date(Date.now() - 10 * 60 * 1000)) as any,
        THIRTY_MINUTES
    )

    const result = await repo.getAlerts(query)

    assert.equal(upstreamCalls, 0)
    assert.equal(result.alerts[0]?.title, 'Cached advisory')
})
