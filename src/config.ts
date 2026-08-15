import dotenv from 'dotenv'

export {config as default};

export type OwmForecastSource = 'free-3h' | 'pro-hourly'

/*--------------------------------------------------------------------------*/

class MissingEnvVarError extends Error {
    constructor(key: string) {
        super(`Environment variable [${key}] is required.`)
    }
}

/*--------------------------------------------------------------------------*/

dotenv.config({
    encoding: 'utf-8',
    override: true
})

/*--------------------------------------------------------------------------*/

function getOwmForecastSource(value: string | undefined): OwmForecastSource {
    const source = value ?? 'free-3h'
    if (source === 'free-3h' || source === 'pro-hourly') return source
    throw new Error('OWM_FORECAST_SOURCE must be free-3h or pro-hourly.')
}

function getPositiveInteger(key: string, value: string | undefined, defaultValue: number): number {
    if (value === undefined) return defaultValue
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${key} must be a strictly positive integer.`)
    }
    return parsed
}

function getNonNegativeInteger(key: string, value: string | undefined, defaultValue: number): number {
    if (value === undefined) return defaultValue
    const parsed = Number(value)
    if (value.trim() === '' || !Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${key} must be a non-negative integer.`)
    }
    return parsed
}

/*--------------------------------------------------------------------------*/

export function createConfig(env: Record<string, string | undefined>) {
    const syncIntervalKey = env.SYNC_INTERVAL_MS !== undefined
        ? 'SYNC_INTERVAL_MS'
        : 'BUOY_SYNC_INTERVAL_MS'
    const syncIntervalValue = env.SYNC_INTERVAL_MS !== undefined
        ? env.SYNC_INTERVAL_MS
        : env.BUOY_SYNC_INTERVAL_MS
    const syncRunOnBoot = env.SYNC_RUN_ON_BOOT !== undefined
        ? env.SYNC_RUN_ON_BOOT
        : env.BUOY_SYNC_RUN_ON_BOOT

    return {
    http: {
        port: parseInt(env.HTTP_PORT || '') || 3002,
        host:          env.HTTP_HOST || '0.0.0.0'
    },
    mongo: {
        uri: env.MONGO_URI,
        maxPoolSize: getPositiveInteger('MONGO_MAX_POOL_SIZE', env.MONGO_MAX_POOL_SIZE, 5)
    },
    ndbc: {
        activeStationsUrl: env.NDBC_ACTIVE_STATIONS_URL || 'https://www.ndbc.noaa.gov/activestations.xml',
        fetchTimeoutMs: getPositiveInteger('NDBC_FETCH_TIMEOUT_MS', env.NDBC_FETCH_TIMEOUT_MS, 20000),
        retries: getNonNegativeInteger('NDBC_FETCH_RETRIES', env.NDBC_FETCH_RETRIES, 3)
    },
    sync: {
        intervalMs: getPositiveInteger(syncIntervalKey, syncIntervalValue, 86400000),
        runOnBoot: syncRunOnBoot?.toLowerCase() !== 'false'
    },
    owm: {
        apiKey: env.OWM_API_KEY,
        forecastSource: getOwmForecastSource(env.OWM_FORECAST_SOURCE)
    },
    mapTiles: {
        enabled: env.MAP_TILES_ENABLED === 'true'
    },
    weatherBit: {
        apiKey: env.WEATHERBIT_API_KEY,
    },
    gemini: {
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite'
    },
    rateLimit: {
        enabled: env.RATE_LIMIT_ENABLED !== 'false', // mặc định bật
        windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS || '60000'),
        ipMax: parseInt(env.RATE_LIMIT_IP_MAX || '60') // trần MỖI IP, áp cho mọi endpoint trừ /api/v1/maps/*
    }
    }
}

const config = createConfig(process.env)
