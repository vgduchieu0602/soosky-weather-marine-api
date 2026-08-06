import assert from 'node:assert/strict'
import test from 'node:test'
import config from '../src/config'
import OwmForecastRepository from '../src/adapters/owm/OwmForecastRepository'

type ForecastSourceConfig = {forecastSource?: 'free-3h' | 'pro-hourly' | 'onecall-4'}

test('uses actual hourly OWM data for the three-hour product slots in Pro mode', async (t) => {
    const originalFetch = globalThis.fetch
    const originalDateNow = Date.now
    const sourceConfig = config.owm as ForecastSourceConfig
    const originalSource = sourceConfig.forecastSource
    sourceConfig.forecastSource = 'pro-hourly'
    Date.now = () => Date.parse('2026-08-05T01:50:00.000Z') // 08:50 UTC+7

    const firstHour = Date.parse('2026-08-05T02:00:00.000Z') / 1000 // 09:00 local
    const list = Array.from({length: 9}, (_, index) => ({
        dt: firstHour + index * 60 * 60,
    }))

    globalThis.fetch = async (url) => {
        const requestedUrl = new URL(String(url))
        assert.equal(requestedUrl.origin, 'https://pro.openweathermap.org')
        assert.equal(requestedUrl.pathname, '/data/2.5/forecast/hourly')
        assert.equal(requestedUrl.searchParams.get('units'), 'metric')
        return new Response(JSON.stringify({
            city: {timezone: 7 * 60 * 60},
            list,
        }))
    }
    t.after(() => {
        globalThis.fetch = originalFetch
        Date.now = originalDateNow
        sourceConfig.forecastSource = originalSource
    })

    const result = await new OwmForecastRepository().getForecast({lat: 10, lon: 106})

    assert.equal(result.timezoneOffsetSeconds, 7 * 60 * 60)
    assert.deepEqual(result.hourly.map((point) => point.time), [
        '2026-08-05T04:00:00.000Z', // 11:00 local
        '2026-08-05T07:00:00.000Z', // 14:00 local
        '2026-08-05T10:00:00.000Z', // 17:00 local
    ])
})

test('simulates three-hour product labels from the next free OWM source step', async (t) => {
    const originalFetch = globalThis.fetch
    const originalDateNow = Date.now
    const sourceConfig = config.owm as ForecastSourceConfig
    const originalSource = sourceConfig.forecastSource
    sourceConfig.forecastSource = 'free-3h'
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
        sourceConfig.forecastSource = originalSource
    })

    const result = await new OwmForecastRepository().getForecast({lat: 10, lon: 106})

    assert.deepEqual(result.hourly.map((point) => point.time), [
        '2026-08-05T04:00:00.000Z', // simulated 11:00 local
        '2026-08-05T07:00:00.000Z', // simulated 14:00 local
        '2026-08-05T10:00:00.000Z', // simulated 17:00 local
    ])
    assert.deepEqual(result.hourly.map((point) => point.temperature), [12, 15, 18])
})

test('returns every upcoming One Call hourly record from the next local hour', async (t) => {
    const originalFetch = globalThis.fetch
    const originalDateNow = Date.now
    const sourceConfig = config.owm as ForecastSourceConfig
    const originalSource = sourceConfig.forecastSource
    sourceConfig.forecastSource = 'onecall-4'
    Date.now = () => Date.parse('2026-08-05T01:50:00.000Z') // 08:50 UTC+7

    globalThis.fetch = async (url) => {
        const urlText = String(url)
        if (urlText.includes('/data/4.0/onecall/timeline/1h')) {
            const requestedUrl = new URL(urlText)
            assert.equal(requestedUrl.origin, 'https://api.openweathermap.org')
            assert.equal(requestedUrl.searchParams.get('units'), 'metric')
            return new Response(JSON.stringify({
                timezone_offset: 7 * 60 * 60,
                data: Array.from({length: 9}, (_, index) => ({
                    dt: Date.parse('2026-08-05T02:00:00.000Z') / 1000 + index * 60 * 60,
                    temp: 9 + index,
                    wind_speed: 2 + index,
                    pop: index / 10,
                    weather: [{id: 800, description: 'clear sky', icon: '01d'}]
                }))
            }))
        }
        if (urlText.includes('/data/4.0/onecall/timeline/1day')) {
            return new Response(JSON.stringify({
                timezone_offset: 7 * 60 * 60,
                data: [{
                    dt: Date.parse('2026-08-05T05:00:00.000Z') / 1000,
                    temp: {min: 22, max: 31},
                    wind_speed: 5,
                    pop: 0.4,
                    weather: [{id: 801, description: 'few clouds', icon: '02d'}]
                }]
            }))
        }
        throw new Error(`unexpected forecast URL: ${urlText.split('?')[0]}`)
    }
    t.after(() => {
        globalThis.fetch = originalFetch
        Date.now = originalDateNow
        sourceConfig.forecastSource = originalSource
    })

    const result = await new OwmForecastRepository().getForecast({lat: 10, lon: 106})

    assert.equal(result.timezoneOffsetSeconds, 7 * 60 * 60)
    assert.deepEqual(result.hourly.map((point) => point.time), [
        '2026-08-05T02:00:00.000Z', // 09:00 local
        '2026-08-05T03:00:00.000Z', // 10:00 local
        '2026-08-05T04:00:00.000Z', // 11:00 local
        '2026-08-05T05:00:00.000Z', // 12:00 local
        '2026-08-05T06:00:00.000Z', // 13:00 local
        '2026-08-05T07:00:00.000Z', // 14:00 local
        '2026-08-05T08:00:00.000Z', // 15:00 local
        '2026-08-05T09:00:00.000Z', // 16:00 local
        '2026-08-05T10:00:00.000Z', // 17:00 local
    ])
    assert.deepEqual(result.hourly.map((point) => point.temperature), [9, 10, 11, 12, 13, 14, 15, 16, 17])
    assert.deepEqual(result.daily, [{
        date: '2026-08-05',
        tempMin: 22,
        tempMax: 31,
        windSpeed: 5,
        pop: 0.4,
        description: 'few clouds',
        conditionCode: '801d',
        icon: '02d'
    }])
})
