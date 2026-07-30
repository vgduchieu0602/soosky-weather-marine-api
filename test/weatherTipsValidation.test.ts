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

test('requires tideChart in a weather-tips payload', () => {
    const {tideChart: _tideChart, ...weatherWithoutTideChart} = validWeather

    assert.equal(
        validateWeatherTipsWeather(weatherWithoutTideChart),
        "Body field 'weather.tideChart' (object) is required."
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
        "Body field 'weather.tideChart.predictions[0].height' must be a number."
    )
})

test('rejects weather-tips output with a tip over 100 characters', () => {
    const tooLongTip = 'a'.repeat(101)

    assert.equal(
        validateWeatherTipsOutput({persona: 'Traveler', tips: [tooLongTip, 'Use sunscreen.']}),
        "Gemini response contains a tip longer than 100 characters."
    )
})
