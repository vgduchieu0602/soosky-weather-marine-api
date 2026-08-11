import assert from 'node:assert/strict'
import test from 'node:test'
import CachedWeatherBitRepository from '../src/adapters/cache/CachedWeatherBitRepository'

const ONE_HOUR = 60 * 60 * 1000

test('WeatherBit serves stale cache when its refetch fails', async () => {
    const cachedAt = new Date(Date.now() - ONE_HOUR - 1).toISOString()
    const observedAt = new Date(Date.now() - 2 * ONE_HOUR).toISOString()
    const cache = {
        read: async () => ({
            fetchedAt: cachedAt,
            temperature: 30,
            humidity: 70,
            dewPoint: 24,
            humidityUpdatedAt: observedAt,
            uvIndex: 4,
            uvUpdatedAt: observedAt,
            humidityCachedAt: cachedAt,
            uvCachedAt: cachedAt
        }),
        write: async () => assert.fail('must not write cache when upstream fails')
    }
    const source = {
        getWeatherBitCurrent: async () => { throw new Error('fetch failed') }
    } as any
    const repo = new CachedWeatherBitRepository(source, cache as any, ONE_HOUR, ONE_HOUR)

    const result = await repo.getWeatherBitCurrent({ lat: 10, lon: 106 })

    assert.deepEqual(result, {
        lat: 10,
        lon: 106,
        temperature: 30,
        humidity: 70,
        dewPoint: 24,
        uvIndex: 4,
        updatedAt: observedAt
    })
})
