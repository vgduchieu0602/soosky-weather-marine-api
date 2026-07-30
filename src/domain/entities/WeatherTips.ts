// ============================================================================
// Smart Weather Tips — lời khuyên ngắn, an toàn, theo persona hoạt động của
// người dùng, sinh bởi Gemini. Input = persona + weather; output = 2-4 tip ngắn.
// ============================================================================

// 5 persona hợp lệ (khớp enum trong output schema Gemini). Server validate
// persona nằm trong danh sách này trước khi gọi use-case.
export const PERSONAS = [
    'Traveler',
    'Water Sports',
    'Coastal Captain',
    'Offshore Fishing',
    'Other'
] as const;

export type Persona = (typeof PERSONAS)[number];

// Weather đầu vào — client gửi lên (thường lấy từ /weather hoặc /buoys/.../weather
// mà FE đã có sẵn). Field nullable đúng theo schema; Gemini tự bỏ tip phụ thuộc
// field null thay vì đoán. Endpoint validate đúng contract trước khi gọi Gemini.
export interface WeatherTipsTidePrediction {
    time: string;
    height: number | string;
}

export interface WeatherTipsTideChart {
    stationId: string;
    predictions: WeatherTipsTidePrediction[];
}

export interface WeatherTipsWeather {
    temperature: number;
    windSpeed: number;
    windDirection: number | string;
    gust: number;
    waveHeight: number | null;
    waterTemp: number | null;
    atmospherePressure: number;
    updatedAt: string;
    visibility: number | null | string;
    uvIndex: number;
    humidity: number | null;
    tideChart: WeatherTipsTideChart;
}

export interface WeatherTips {
    persona: Persona;
    tips: string[];   //2-4 tip, mỗi tip <=100 ký tự
}

const WEATHER_FIELDS = [
    'temperature', 'windSpeed', 'windDirection', 'gust', 'waveHeight', 'waterTemp',
    'atmospherePressure', 'updatedAt', 'visibility', 'uvIndex', 'humidity', 'tideChart'
] as const;

const TIDE_CHART_FIELDS = ['stationId', 'predictions'] as const;
const TIDE_PREDICTION_FIELDS = ['time', 'height'] as const;

function isObject (value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyFields (value: Record<string, unknown>, fields: readonly string[]): boolean {
    return Object.keys(value).every(key => fields.includes(key));
}

function isIsoTimestamp (value: string): boolean {
    return !Number.isNaN(Date.parse(value));
}

function isUnavailableMeasurement (value: unknown): boolean {
    return typeof value === 'string' && value.trim().toLowerCase() === 'n/a';
}

function isFiniteNumberOrNumericString (value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;

    const numericValue = value.trim();
    return numericValue.length > 0
        && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(numericValue)
        && Number.isFinite(Number(numericValue));
}

/** Validates the exact weather payload accepted by POST /api/v1/weather-tips. */
export function validateWeatherTipsWeather (value: unknown): string | null {
    if (!isObject(value)) return "Body field 'weather' (object) is required."
    if (!hasOnlyFields(value, WEATHER_FIELDS)) return "Body field 'weather' contains unsupported fields."

    if (!('tideChart' in value) || !isObject(value.tideChart)) {
        return "Body field 'weather.tideChart' (object) is required."
    }

    for (const field of WEATHER_FIELDS) {
        if (!(field in value)) return `Body field 'weather.${field}' is required.`
    }

    const numberFields = ['temperature', 'windSpeed', 'gust', 'atmospherePressure', 'uvIndex'] as const;
    for (const field of numberFields) {
        if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
            return `Body field 'weather.${field}' must be a number.`
        }
    }

    if (typeof value.windDirection !== 'number' && typeof value.windDirection !== 'string') {
        return "Body field 'weather.windDirection' must be a number or compass string."
    }
    if (typeof value.windDirection === 'number' && (value.windDirection < 0 || value.windDirection > 360)) {
        return "Body field 'weather.windDirection' must be between 0 and 360."
    }
    if (typeof value.updatedAt !== 'string' || !isIsoTimestamp(value.updatedAt)) {
        return "Body field 'weather.updatedAt' must be an ISO 8601 timestamp."
    }

    const nullableNumberFields = ['waveHeight', 'waterTemp', 'humidity'] as const;
    for (const field of nullableNumberFields) {
        if (value[field] !== null && (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) {
            return `Body field 'weather.${field}' must be a number or null.`
        }
    }
    if (value.visibility !== null && !isFiniteNumberOrNumericString(value.visibility)
        && !isUnavailableMeasurement(value.visibility)) {
        return "Body field 'weather.visibility' must be a number, numeric string, 'n/a', or null."
    }
    if (typeof value.humidity === 'number' && (value.humidity < 0 || value.humidity > 100)) {
        return "Body field 'weather.humidity' must be between 0 and 100."
    }

    if (!hasOnlyFields(value.tideChart, TIDE_CHART_FIELDS)) {
        return "Body field 'weather.tideChart' contains unsupported fields."
    }
    if (typeof value.tideChart.stationId !== 'string' || !value.tideChart.stationId) {
        return "Body field 'weather.tideChart.stationId' must be a non-empty string."
    }
    if (!Array.isArray(value.tideChart.predictions)) {
        return "Body field 'weather.tideChart.predictions' must be an array."
    }

    for (let index = 0; index < value.tideChart.predictions.length; index++) {
        const prediction = value.tideChart.predictions[index];
        const path = `weather.tideChart.predictions[${index}]`;
        if (!isObject(prediction)) return `Body field '${path}' must be an object.`
        if (!hasOnlyFields(prediction, TIDE_PREDICTION_FIELDS)) {
            return `Body field '${path}' contains unsupported fields.`
        }
        if (typeof prediction.time !== 'string' || !isIsoTimestamp(prediction.time)) {
            return `Body field '${path}.time' must be an ISO 8601 timestamp.`
        }
        if (!isFiniteNumberOrNumericString(prediction.height)) {
            return `Body field '${path}.height' must be a number or numeric string.`
        }
    }

    return null
}

/** Validates the structured response received from Gemini before returning it to the client. */
export function validateWeatherTipsOutput (value: unknown): string | null {
    if (!isObject(value) || !Array.isArray(value.tips)) return 'Gemini response missing tips.'
    if (value.tips.length < 2 || value.tips.length > 4) {
        return 'Gemini response must contain 2 to 4 tips.'
    }
    if (value.tips.some(tip => typeof tip !== 'string')) return 'Gemini response contains a non-string tip.'
    if (value.tips.some(tip => tip.length > 100)) {
        return 'Gemini response contains a tip longer than 100 characters.'
    }
    return null
}
