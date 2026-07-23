import dotenv from 'dotenv'

export {config as default};

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

const config = {
    http: {
        port: parseInt(process.env.HTTP_PORT || '') || 3002,
        host:          process.env.HTTP_HOST || '0.0.0.0'
    },
    mongo: {
        uri: process.env.MONGO_URI
    },
    owm: {
        apiKey: process.env.OWM_API_KEY
    },
    weatherBit: {
        apiKey: process.env.WEATHERBIT_API_KEY,
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite'
    },
    rateLimit: {
        enabled: process.env.RATE_LIMIT_ENABLED !== 'false', // đặt 'false' để tắt (test); mặc định bật
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
        globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '120')
    }
}
