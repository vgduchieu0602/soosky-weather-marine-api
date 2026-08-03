// ============================================================================
// cacheFreshness.test.ts — TTL phải đo từ lúc GHI CACHE, không phải từ mốc quan
// trắc của upstream (WeatherBit ob_time trễ 15-60 phút). Và forecast OWM phải
// hết hạn khi sang ngày mới UTC dù TTL 24h chưa chạy hết.
// ============================================================================

import assert from 'node:assert/strict'
import test from 'node:test'
import CachedWeatherBitRepository from '../src/adapters/cache/CachedWeatherBitRepository'
import { WeatherBitCacheEntry } from '../src/adapters/cache/IWeatherBitCacheStore'
import { cacheAside } from '../src/adapters/cache/cacheAside'

const ONE_HOUR = 60 * 60 * 1000
const ONE_DAY = 24 * ONE_HOUR

function fakeWeatherBitStore () {
    let doc: WeatherBitCacheEntry | null = null
    return {
        read: async () => doc,
        write: async (_q: any, patch: Partial<WeatherBitCacheEntry>) => {
            doc = { ...(doc ?? {} as WeatherBitCacheEntry), ...patch }
        }
    }
}

test('WeatherBit cache tính TTL từ lúc ghi cache, không từ ob_time trễ của upstream', async () => {
    const cache = fakeWeatherBitStore()
    let upstreamCalls = 0
    // ob_time trễ 2 giờ so với hiện tại (WeatherBit free tier trễ thật 15-60 phút).
    const observedAt = new Date(Date.now() - 2 * ONE_HOUR).toISOString()
    const source = {
        getWeatherBitCurrent: async () => {
            upstreamCalls += 1
            return { lat: 10, lon: 106, temperature: 30, uvIndex: 4, humidity: 70, dewPoint: 24, updatedAt: observedAt }
        }
    } as any

    const repo = new CachedWeatherBitRepository(source, cache as any, ONE_HOUR, ONE_HOUR)

    await repo.getWeatherBitCurrent({ lat: 10, lon: 106 })
    const second = await repo.getWeatherBitCurrent({ lat: 10, lon: 106 })

    assert.equal(upstreamCalls, 1, 'lần gọi thứ 2 phải lấy từ cache, không gọi upstream')
    assert.equal(second.humidity, 70)
})

test('WeatherBit vẫn trả ob_time của upstream cho client', async () => {
    const cache = fakeWeatherBitStore()
    const observedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const source = {
        getWeatherBitCurrent: async () => ({
            lat: 10, lon: 106, temperature: 30, uvIndex: 4, humidity: 70, dewPoint: 24, updatedAt: observedAt
        })
    } as any

    const repo = new CachedWeatherBitRepository(source, cache as any, ONE_HOUR, ONE_HOUR)

    await repo.getWeatherBitCurrent({ lat: 10, lon: 106 })
    const cached = await repo.getWeatherBitCurrent({ lat: 10, lon: 106 })

    assert.equal(cached.updatedAt, observedAt)
})

test('forecast OWM hết hạn khi sang ngày mới UTC dù TTL 24h chưa hết', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 7, 3, 0, 10) })

    let upstreamCalls = 0
    const hit = { value: { marker: 'cũ' }, freshAt: new Date(Date.UTC(2026, 7, 2, 23, 0)) }
    const store = {
        read: async () => hit,
        write: async () => undefined
    } as any

    const value = await cacheAside(
        store, { lat: 10, lon: 106 }, ONE_DAY,
        async () => { upstreamCalls += 1; return { marker: 'mới' } },
        'owm-forecast',
        { expiresOnUtcDayChange: true }
    )

    assert.equal(upstreamCalls, 1, 'qua mốc ngày UTC -> phải refetch')
    assert.deepEqual(value, { marker: 'mới' })
})

test('forecast OWM vẫn dùng cache trong cùng ngày UTC', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 7, 3, 20, 0) })

    let upstreamCalls = 0
    const hit = { value: { marker: 'cũ' }, freshAt: new Date(Date.UTC(2026, 7, 3, 1, 0)) }
    const store = {
        read: async () => hit,
        write: async () => undefined
    } as any

    const value = await cacheAside(
        store, { lat: 10, lon: 106 }, ONE_DAY,
        async () => { upstreamCalls += 1; return { marker: 'mới' } },
        'owm-forecast',
        { expiresOnUtcDayChange: true }
    )

    assert.equal(upstreamCalls, 0, 'cùng ngày UTC + trong TTL -> cache hit')
    assert.deepEqual(value, { marker: 'cũ' })
})
