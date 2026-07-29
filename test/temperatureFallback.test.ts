import assert from 'node:assert/strict'
import test from 'node:test'
import GetBuoyWeatherDetailUseCase from '../src/domain/use-cases/buoy/GetBuoyWeatherDetailUseCase'
import GetPointWeatherDetailUseCase from '../src/domain/use-cases/weather/GetPointWeatherDetailUseCase'

type TemperatureSource = 'ndbc' | 'weatherbit' | 'owm' | null
type DetailWithTemperatureSource = { temperature: number | null; temperatureSource?: TemperatureSource }

const locator = {
    nearestTideStations: async () => [],
    nearestBuoyStations: async () => []
} as any

const tideRepo = {
    getTideChart: async () => null
} as any

const forecastRepo = {
    getForecast: async () => null
} as any

const stationRepo = {
    findByBuoyId: async () => null,
    seedIfAbsent: async () => undefined
} as any

function pointWeather (temperature: number | null) {
    return {
        lat: 10,
        lon: 106,
        conditionCode: '800d',
        conditionMain: 'Clear',
        description: 'clear sky',
        icon: '01d',
        windDirection: 180,
        windSpeed: 4,
        gust: null,
        waveHeight: null,
        atmospherePressure: 1008,
        temperature,
        waterTemp: null,
        visibility: 10000,
        updatedAt: '2026-07-29T00:00:00.000Z'
    }
}

function weatherBit (temperature: number | null) {
    return {
        lat: 10,
        lon: 106,
        temperature,
        uvIndex: 4,
        humidity: 70,
        dewPoint: 24,
        updatedAt: '2026-07-29T00:00:00.000Z'
    } as any
}

function buoyWeather (temperature: number | null) {
    return {
        buoyId: '46026',
        windDirection: 180,
        windSpeed: 4,
        gust: null,
        waveHeight: 1.2,
        atmospherePressure: 1008,
        temperature,
        waterTemp: 29,
        visibility: 10000,
        updatedAt: '2026-07-29T00:00:00.000Z'
    }
}

test('buoy falls back to Weatherbit temperature when NDBC ATMP is missing', async () => {
    const useCase = new GetBuoyWeatherDetailUseCase(
        { getBuoyWeather: async () => buoyWeather(null) } as any,
        tideRepo,
        { getWeatherBitCurrent: async () => weatherBit(30) } as any,
        forecastRepo,
        locator,
        stationRepo,
        { getPointWeather: async () => pointWeather(31) } as any
    )

    const detail = await useCase.execute({ buoyId: '46026', lat: 10, lon: 106 }) as DetailWithTemperatureSource

    assert.equal(detail.temperature, 30)
    assert.equal(detail.temperatureSource, 'weatherbit')
})

test('buoy keeps measured NDBC air temperature ahead of coordinate sources', async () => {
    const useCase = new GetBuoyWeatherDetailUseCase(
        { getBuoyWeather: async () => buoyWeather(28) } as any,
        tideRepo,
        { getWeatherBitCurrent: async () => weatherBit(30) } as any,
        forecastRepo,
        locator,
        stationRepo,
        { getPointWeather: async () => pointWeather(31) } as any
    )

    const detail = await useCase.execute({ buoyId: '41002', lat: 10.1, lon: 106.1 }) as DetailWithTemperatureSource

    assert.equal(detail.temperature, 28)
    assert.equal(detail.temperatureSource, 'ndbc')
})

test('buoy weather includes the station name from buoy metadata', async () => {
    const useCase = new GetBuoyWeatherDetailUseCase(
        { getBuoyWeather: async () => buoyWeather(28) } as any,
        tideRepo,
        { getWeatherBitCurrent: async () => weatherBit(30) } as any,
        forecastRepo,
        locator,
        {
            findByBuoyId: async () => ({ buoyId: '41002', name: 'South Hatteras', lat: 31.76, lon: -74.84 }),
            seedIfAbsent: async () => undefined
        } as any,
        { getPointWeather: async () => pointWeather(31) } as any
    )

    const detail = await useCase.execute({ buoyId: '41002', lat: 10.15, lon: 106.15 }) as any

    assert.equal(detail.buoyName, 'South Hatteras')
})

test('point weather prefers Weatherbit temperature before OpenWeatherMap', async () => {
    const useCase = new GetPointWeatherDetailUseCase(
        { getPointWeather: async () => pointWeather(31) } as any,
        tideRepo,
        { getWeatherBitCurrent: async () => weatherBit(30) } as any,
        forecastRepo,
        { getBuoyWeather: async () => buoyWeather(null) } as any,
        locator
    )

    const detail = await useCase.execute({ lat: 10.2, lon: 106.2 }) as DetailWithTemperatureSource

    assert.equal(detail.temperature, 30)
    assert.equal(detail.temperatureSource, 'weatherbit')
})
