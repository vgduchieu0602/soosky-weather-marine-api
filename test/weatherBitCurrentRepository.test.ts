import assert from 'node:assert/strict'
import test from 'node:test'
import WeatherBitCurrentRepository from '../src/adapters/weatherbit/WeatherBitCurrentRepository'

test('maps the Weatherbit current temperature field', async (t) => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({
        data: [{
            temp: 30,
            uv: 4,
            rh: 70,
            dewpt: 24,
            ts: 1785283200
        }]
    }))
    t.after(() => { globalThis.fetch = originalFetch })

    const result = await new WeatherBitCurrentRepository().getWeatherBitCurrent({ lat: 10, lon: 106 }) as any

    assert.equal(result.temperature, 30)
})
