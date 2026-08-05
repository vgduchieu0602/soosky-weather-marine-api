import assert from 'node:assert/strict'
import test from 'node:test'
import OwmForecastRepository from '../src/adapters/owm/OwmForecastRepository'

test('includes the closest OWM forecast point even when it is less than three hours after now', async (t) => {
    const originalFetch = globalThis.fetch
    const originalDateNow = Date.now
    Date.now = () => Date.parse('2026-08-05T04:31:00.000Z') // 11:31 at UTC+7
    globalThis.fetch = async () => new Response(JSON.stringify({
        city: { timezone: 7 * 60 * 60 },
        list: [
            { dt: Date.parse('2026-08-05T06:00:00.000Z') / 1000 }, // 13:00 local
            { dt: Date.parse('2026-08-05T09:00:00.000Z') / 1000 }, // 16:00 local
            { dt: Date.parse('2026-08-05T12:00:00.000Z') / 1000 }, // 19:00 local
            { dt: Date.parse('2026-08-05T15:00:00.000Z') / 1000 }  // 22:00 local
        ]
    }))
    t.after(() => {
        globalThis.fetch = originalFetch
        Date.now = originalDateNow
    })

    const result = await new OwmForecastRepository().getForecast({ lat: 10, lon: 106 })

    assert.deepEqual(result.hourly.map((point) => point.time), [
        '2026-08-05T06:00:00.000Z',
        '2026-08-05T09:00:00.000Z',
        '2026-08-05T12:00:00.000Z',
        '2026-08-05T15:00:00.000Z'
    ])
})
