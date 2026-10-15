import assert from 'node:assert/strict'
import test from 'node:test'
import OwmForecastRepository from '../src/adapters/owm/OwmForecastRepository'

test('simulates three-hour product labels from the next free OWM source step', async (t) => {
    const originalFetch = globalThis.fetch
    const originalDateNow = Date.now
    Date.now = () => Date.parse('2026-08-05T01:50:00.000Z') // 08:50 UTC+7

    globalThis.fetch = async (url) => {
        const requestedUrl = new URL(String(url))
        assert.equal(requestedUrl.origin, 'https://api.openweathermap.org')
        assert.equal(requestedUrl.pathname, '/data/2.5/forecast')
        return new Response(JSON.stringify({
            city: {timezone: 7 * 60 * 60},
            list: [
                {dt: Date.parse('2026-08-05T02:00:00.000Z') / 1000, main: {temp: 9}},  // 09:00 local
                {dt: Date.parse('2026-08-05T05:00:00.000Z') / 1000, main: {temp: 12}}, // 12:00 local
                {dt: Date.parse('2026-08-05T08:00:00.000Z') / 1000, main: {temp: 15}}, // 15:00 local
                {dt: Date.parse('2026-08-05T11:00:00.000Z') / 1000, main: {temp: 18}}, // 18:00 local
            ]
        }))
    }
    t.after(() => {
        globalThis.fetch = originalFetch
        Date.now = originalDateNow
    })

    const result = await new OwmForecastRepository().getForecast({lat: 10, lon: 106})

    assert.deepEqual(result.hourly.map((point) => point.time), [
        '2026-08-05T04:00:00.000Z', // simulated 11:00 local
        '2026-08-05T07:00:00.000Z', // simulated 14:00 local
        '2026-08-05T10:00:00.000Z', // simulated 17:00 local
    ])
    assert.deepEqual(result.hourly.map((point) => point.temperature), [12, 15, 18])
})

test('aggregates free three-hour steps into local-day daily points', async (t) => {
    const originalFetch = globalThis.fetch
    const originalDateNow = Date.now
    Date.now = () => Date.parse('2026-08-05T01:50:00.000Z') // 08:50 UTC+7

    globalThis.fetch = async () => new Response(JSON.stringify({
        city: {timezone: 7 * 60 * 60},
        list: [
            // 09:00 -> 21:00 giờ địa phương ngày 05
            {dt: Date.parse('2026-08-05T02:00:00.000Z') / 1000, main: {temp: 26, temp_min: 25, temp_max: 27}},
            {
                dt: Date.parse('2026-08-05T05:00:00.000Z') / 1000, // 12:00 local -> bước đại diện
                main: {temp: 30, temp_min: 29, temp_max: 31},
                wind: {speed: 5},
                pop: 0.4,
                weather: [{id: 500, description: 'light rain', icon: '10d'}]
            },
            {
                dt: Date.parse('2026-08-05T08:00:00.000Z') / 1000,
                main: {temp: 31, temp_min: 30, temp_max: 33},
                wind: {speed: 7},
                pop: 0.6,
                weather: [{id: 501, description: 'moderate rain', icon: '10d'}]
            },
            {dt: Date.parse('2026-08-05T11:00:00.000Z') / 1000, main: {temp: 28, temp_min: 27, temp_max: 29}, wind: {speed: 4}, pop: 0.2},
            {dt: Date.parse('2026-08-05T14:00:00.000Z') / 1000, main: {temp: 26, temp_min: 25, temp_max: 26}},
            // 00:00 giờ địa phương -> đã sang ngày 06
            {
                dt: Date.parse('2026-08-05T17:00:00.000Z') / 1000,
                main: {temp: 24, temp_min: 23, temp_max: 25},
                weather: [{id: 801, description: 'few clouds', icon: '02n'}]
            }
        ]
    }))
    t.after(() => {
        globalThis.fetch = originalFetch
        Date.now = originalDateNow
    })

    const result = await new OwmForecastRepository().getForecast({lat: 10, lon: 106})

    // min/max lấy biên cả ngày, wind/pop lấy max, description lấy bước gần 12:00
    // giờ địa phương nhất. Icon luôn ép hậu tố 'd' dù bước nguồn là ban đêm.
    assert.deepEqual(result.daily, [
        {
            date: '2026-08-05',
            tempMin: 25,
            tempMax: 33,
            windSpeed: 7,
            pop: 0.6,
            description: 'light rain',
            conditionCode: '500d',
            icon: '10d'
        },
        {
            date: '2026-08-06',
            tempMin: 23,
            tempMax: 25,
            windSpeed: null,
            pop: null,
            description: 'few clouds',
            conditionCode: '801d',
            icon: '02d'
        }
    ])
})
