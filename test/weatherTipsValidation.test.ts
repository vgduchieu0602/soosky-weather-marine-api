import assert from 'node:assert/strict'
import test from 'node:test'
import {validateWeatherTipsOutput, validateWeatherTipsWeather} from '../src/domain/entities/WeatherTips'

const validWeather = {
    temperature: 26,
    windSpeed: 12,
    windDirection: 180,
    gust: 18,
    waveHeight: 1.2,
    waterTemp: 25,
    atmospherePressure: 1012,
    updatedAt: '2026-07-30T08:00:00.000Z',
    visibility: 10,
    uvIndex: 6,
    humidity: 70,
    tideChart: {
        stationId: '9414290',
        predictions: [{time: '2026-07-30T09:00:00.000Z', height: 1.1}]
    }
}

test('accepts a weather-tips payload matching the tideChart contract', () => {
    assert.equal(validateWeatherTipsWeather(validWeather), null)
})

test('accepts a weather-tips payload without tide data', () => {
    assert.equal(validateWeatherTipsWeather({...validWeather, tideChart: null}), null)
})

test('rejects a tide-chart placeholder so FE sends null when data is unavailable', () => {
    assert.equal(
        validateWeatherTipsWeather({...validWeather, tideChart: 'n/a'}),
        "Body field 'weather.tideChart' must be an object or null."
    )
})

test('accepts unavailable visibility and numeric-string tide heights', () => {
    const weatherWithSourceStringValues = {
        temperature: 17.3,
        windSpeed: 1,
        windDirection: 270,
        gust: 2,
        waveHeight: 0.1,
        waterTemp: 16.5,
        atmospherePressure: 1014.3,
        updatedAt: '2026-07-30T07:00:00Z',
        visibility: 'n/a',
        uvIndex: 0,
        humidity: 85,
        tideChart: {
            stationId: '9414958',
            predictions: [
                {time: '2026-07-30T00:00:00Z', height: '0.671'},
                {time: '2026-07-30T01:00:00Z', height: '0.627'}
            ]
        }
    }

    assert.equal(validateWeatherTipsWeather(weatherWithSourceStringValues), null)
})

test('requires tideChart in a weather-tips payload', () => {
    const {tideChart: _tideChart, ...weatherWithoutTideChart} = validWeather

    assert.equal(
        validateWeatherTipsWeather(weatherWithoutTideChart),
        "Body field 'weather.tideChart' (object or null) is required."
    )
})

test('rejects a tide prediction whose height is not numeric', () => {
    const invalidWeather = {
        ...validWeather,
        tideChart: {
            ...validWeather.tideChart,
            predictions: [{time: '2026-07-30T09:00:00.000Z', height: 'high'}]
        }
    }

    assert.equal(
        validateWeatherTipsWeather(invalidWeather),
        "Body field 'weather.tideChart.predictions[0].height' must be a number or numeric string."
    )
})

test('rejects weather-tips output with a tip over 100 characters', () => {
    const tooLongTip = 'a'.repeat(101)

    assert.equal(
        validateWeatherTipsOutput({persona: 'Traveler', tips: [tooLongTip, 'Use sunscreen.']}),
        "Gemini response contains a tip longer than 100 characters."
    )
})
