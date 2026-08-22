import assert from 'node:assert/strict'
import test from 'node:test'
import GetBuoyWeatherDetailUseCase from '../src/domain/use-cases/buoy/GetBuoyWeatherDetailUseCase'

// Tên trạm: DB "buoys" là nguồn chuẩn, thiếu/null thì fallback activestations.xml.
// Ca DB có doc nhưng name: null là thật — lazy seed của API insert name: null rồi
// seedManyIfAbsent ($setOnInsert) không bao giờ vá.

const MASONBORO = 'Masonboro Inlet, ILM2, NC (150)'

const locator = { nearestTideStations: async () => [], nearestBuoyStations: async () => [] } as any
const tideRepo = { getTideChart: async () => null } as any
const forecastRepo = { getForecast: async () => null } as any
const weatherBitRepo = { getWeatherBitCurrent: async () => null } as any
const pointRepo = { getPointWeather: async () => null } as any
const buoyRepo = {
    getBuoyWeather: async () => ({
        buoyId: '41110',
        windDirection: null,
        windSpeed: null,
        gust: null,
        waveHeight: 0.5,
        atmospherePressure: null,
        temperature: null,
        waterTemp: 29,
        visibility: null,
        updatedAt: '2026-08-22T06:30:00Z'
    })
} as any

function makeUseCase (stationRepo: unknown, stationSource: unknown) {
    return new GetBuoyWeatherDetailUseCase(
        buoyRepo, tideRepo, weatherBitRepo, forecastRepo,
        locator, stationRepo as any, pointRepo, stationSource as any
    )
}

function seedable (findByBuoyId: () => Promise<unknown>) {
    return { findByBuoyId, seedIfAbsent: async () => undefined }
}

function sourceWith (stations: Array<{ buoyId: string; name: string | null }>) {
    let calls = 0
    return {
        source: { listActive: async () => { calls += 1; return stations } },
        calls: () => calls
    }
}

test('buoy name falls back to the active-stations feed when the DB has no document', async () => {
    const { source, calls } = sourceWith([{ buoyId: '41110', name: MASONBORO }])
    const useCase = makeUseCase(seedable(async () => null), source)

    const detail = await useCase.execute({ buoyId: '41110', lat: 34.144, lon: -77.715 })

    assert.equal(detail.buoyName, MASONBORO)
    assert.equal(calls(), 1)
})

test('buoy name falls back when the DB document was lazy-seeded with a null name', async () => {
    const { source, calls } = sourceWith([{ buoyId: '41110', name: MASONBORO }])
    const useCase = makeUseCase(
        seedable(async () => ({ buoyId: '41110', name: null, lat: 34.144, lon: -77.715 })),
        source
    )

    const detail = await useCase.execute({ buoyId: '41110', lat: 34.144, lon: -77.715 })

    assert.equal(detail.buoyName, MASONBORO)
    assert.equal(calls(), 1)
})

test('buoy name keeps the DB value and never touches the feed', async () => {
    const { source, calls } = sourceWith([{ buoyId: '41110', name: 'stale feed name' }])
    const useCase = makeUseCase(
        seedable(async () => ({ buoyId: '41110', name: MASONBORO, lat: 34.144, lon: -77.715 })),
        source
    )

    const detail = await useCase.execute({ buoyId: '41110', lat: 34.144, lon: -77.715 })

    assert.equal(detail.buoyName, MASONBORO)
    assert.equal(calls(), 0)
})

test('buoy name is null when the feed does not list the station', async () => {
    const { source } = sourceWith([{ buoyId: '44008', name: 'NANTUCKET' }])
    const useCase = makeUseCase(seedable(async () => null), source)

    const detail = await useCase.execute({ buoyId: '41110', lat: 34.144, lon: -77.715 })

    assert.equal(detail.buoyName, null)
})

test('buoy detail still resolves when both name sources fail', async () => {
    const useCase = makeUseCase(
        seedable(async () => { throw new Error('mongo down') }),
        { listActive: async () => { throw new Error('NDBC down') } }
    )

    const detail = await useCase.execute({ buoyId: '41110', lat: 34.144, lon: -77.715 })

    assert.equal(detail.buoyName, null)
    // Các field khác không bị ảnh hưởng bởi lỗi tra tên.
    assert.equal(detail.buoyId, '41110')
    assert.equal(detail.waveHeight, 0.5)
    assert.equal(detail.waterTemp, 29)
})

test('buoy name falls back to the feed when the DB lookup throws', async () => {
    const { source } = sourceWith([{ buoyId: '41110', name: MASONBORO }])
    const useCase = makeUseCase(
        seedable(async () => { throw new Error('mongo down') }),
        source
    )

    const detail = await useCase.execute({ buoyId: '41110', lat: 34.144, lon: -77.715 })

    assert.equal(detail.buoyName, MASONBORO)
})
