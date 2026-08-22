import dotenv from 'dotenv';

dotenv.config({ encoding: 'utf-8', override: true });

export class MissingEnvVarError extends Error {
    constructor(key: string) {
        super(`Environment variable [${key}] is required.`);
        this.name = 'MissingEnvVarError';
    }
}

const DEFAULT_HTTP_PORT = 3002;
// Bind loopback: app chạy sau nginx reverse-proxy cùng máy, không phơi trực tiếp ra internet.
// Đặt HTTP_HOST=0.0.0.0 nếu cần cho truy cập từ ngoài.
const DEFAULT_HTTP_HOST = '127.0.0.1';

const config = {
    http: {
        host: process.env['HTTP_HOST'] || DEFAULT_HTTP_HOST,
        port: Number.parseInt(process.env['HTTP_PORT'] || '') || DEFAULT_HTTP_PORT,
    },
    mongo: {
        uri: process.env['MONGO_URI'],
        maxPoolSize: Number(process.env['MONGO_MAX_POOL_SIZE'] || 5),
    },
    ndbc: {
        activeStationsUrl: process.env['NDBC_ACTIVE_STATIONS_URL'] || 'https://www.ndbc.noaa.gov/activestations.xml',
        fetchTimeoutMs: Number(process.env['NDBC_FETCH_TIMEOUT_MS'] || 20000),
        retries: Number(process.env['NDBC_FETCH_RETRIES'] || 3),
    },
    sync: {
        intervalMs: Number(process.env['SYNC_INTERVAL_MS'] || 86400000), // mặc định 1 ngày
        runOnBoot: process.env['SYNC_RUN_ON_BOOT']?.toLowerCase() !== 'false',
    },
    owm: {
        apiKey: process.env['OWM_API_KEY'],
    },
    mapTiles: {
        enabled: process.env['MAP_TILES_ENABLED'] === 'true',
    },
    weatherBit: {
        apiKey: process.env['WEATHERBIT_API_KEY'],
    },
    gemini: {
        apiKey: process.env['GEMINI_API_KEY'],
        model: process.env['GEMINI_MODEL'] || 'gemini-3.1-flash-lite',
    },
    rateLimit: {
        enabled: process.env['RATE_LIMIT_ENABLED'] !== 'false', 
        windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] || 60000),
        ipMax: Number(process.env['RATE_LIMIT_IP_MAX'] || 60),
    },
};

export default config;
