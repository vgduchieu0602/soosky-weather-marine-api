import config from './config'
import Server from './http/Server'
import NoaaTidesRepository from './adapters/noaa/NoaaTideRepository';
import GetTideChartUseCase from './domain/use-cases/tide/getTideChartUseCase';
import NdbcBuoyRepository from './adapters/ndbc/NdbcBuoyRepository';
import GetBuoyWeatherDetailUseCase from './domain/use-cases/buoy/GetBuoyWeatherDetailUseCase';

import connectMongo from './adapters/mongo/connectMongo';
import MongoBuoyWeatherRepository from './adapters/mongo/MongoBuoyWeatherRepository';
import WeatherBitCurrentRepository from './adapters/weatherbit/WeatherBitCurrentRepository';
import OwmForecastRepositoryImpl from './adapters/owm/OwmForecastRepository';

import MongoTideRepository from './adapters/mongo/MongoTideRepository';
import MongoWeatherBitRepository from './adapters/mongo/MongoWeatherBitRepository';
import MongoOwmForecastRepository from './adapters/mongo/MongoOwmForecastRepository';

import GetPointWeatherDetailUseCase from './domain/use-cases/weather/GetPointWeatherDetailUseCase';
import OwmCurrentRepository from './adapters/owm/OwmCurrentRepository';
import MongoPointWeatherRepository from './adapters/mongo/MongoPointWeatherRepository';

import GetMapTileUseCase from './domain/use-cases/map/GetMapTileUseCase';
import OwmMapTileRepository from './adapters/owm/OwmMapTileRepository';
import InMemoryMapTileRepository from './adapters/cache/InMemoryMapTileRepository';
import GlobalRateLimiter from './http/GlobalRateLimiter';

import GetRadarUseCase from './domain/use-cases/radar/GetRadarUseCase';
import RainviewerRadarRepository from './adapters/rainviewer/RainviewerRadarRepository';
import MongoRadarRepository from './adapters/mongo/MongoRadarRepository';

import GetAlertsUseCase from './domain/use-cases/alert/GetAlertsUseCase';
import WeatherBitAlertRepository from './adapters/weatherbit/WeatherBitAlertRepository';
import MongoAlertRepository from './adapters/mongo/MongoAlertRepository';

import GetWeatherTipsUseCase from './domain/use-cases/tips/GetWeatherTipsUseCase';
import GeminiWeatherAdvisor from './adapters/gemini/GeminiWeatherAdvisor';

import StationLocatorImpl from './adapters/station/StationLocator';

/*----------------------------------------------------------------------------------*/

const {
    http: {
        port: HTTP_PORT,
        host: HTTP_HOST
    }
} = config;

const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const THREE_HOURS = 3 * ONE_HOUR;
const ONE_DAY = 24 * ONE_HOUR;

/*----------------------------------------------------------------------------------*/

// --- Adapter ---
const tideRepo = new NoaaTidesRepository()
const buoyRepo = new NdbcBuoyRepository()

const mongoBuoyRepo = new MongoBuoyWeatherRepository(buoyRepo, THIRTY_MINUTES)

// Tide/OWM/WeatherBit dùng CHUNG pattern cache-aside qua Mongo như buoy — cache
// share giữa mọi user + mọi instance, sống sót qua restart (in-memory cũ thì
// không). TTL giữ theo cadence riêng từng nguồn, KHÔNG ép về 30 phút:
//  - tide 1 ngày: prediction cho 1 ngày cụ thể không đổi trong ngày đó.
//  - OWM 1 ngày: forecast chỉ cần refresh 1 lần/ngày theo yêu cầu.
//  - WeatherBit: humidity 1h, uvIndex 3h (2 field lệch nhịp, 2 timestamp riêng).
const cachedTideRepo = new MongoTideRepository(tideRepo, ONE_DAY)
const weatherBitRepo = new MongoWeatherBitRepository(new WeatherBitCurrentRepository(), ONE_HOUR, THREE_HOURS)
const forecastRepo = new MongoOwmForecastRepository(new OwmForecastRepositoryImpl(), ONE_DAY)

// Current weather theo điểm bất kỳ (OWM current), cache-aside Mongo 30 phút —
// cùng cadence buoy (data đo thực tế, đổi liên tục).
const pointWeatherRepo = new MongoPointWeatherRepository(new OwmCurrentRepository(), THIRTY_MINUTES)

// Map tile: cache TTL ngắn TRONG RAM (không Mongo — ảnh nặng, không cần bền vững),
// có cap LRU để RAM không phình. Giảm gọi OWM khi pan/zoom xin lại cùng tile.
const mapTileRepo = new InMemoryMapTileRepository(new OwmMapTileRepository())
const radarRepo = new MongoRadarRepository(new RainviewerRadarRepository(), TEN_MINUTES)
const alertRepo = new MongoAlertRepository(new WeatherBitAlertRepository(), THIRTY_MINUTES)

// Smart Weather Tips (Gemini). KHÔNG cache (mỗi request persona/weather khác nhau,
// output ngắn) — gọi thẳng Gemini. Cần GEMINI_API_KEY trong .env.
if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is required.')
}
const weatherAdvisorRepo = new GeminiWeatherAdvisor(config.gemini.apiKey, config.gemini.model)

// Tra trạm NDBC/NOAA gần nhất theo lat/lon (auto-resolve buoyId/tideStationId) để
// giảm null — xem StationLocator.ts (cache directory in-memory 24h).
const stationLocator = new StationLocatorImpl()

// Giới hạn TỔNG số request (mọi client cộng lại) trong 1 cửa sổ — xem
// GlobalRateLimiter.ts. Dùng đúng config đã khai báo sẵn từ đầu project
// (RATE_LIMIT_WINDOW_MS/RATE_LIMIT_GLOBAL_MAX), trước đây chưa có middleware nào áp dụng.
const rateLimiter = new GlobalRateLimiter(config.rateLimit.windowMs, config.rateLimit.globalMax)

// --- Use Cases ---
const useCases = {
    tide: {
        getTideChart: new GetTideChartUseCase(cachedTideRepo)
    },
    buoy: {
        getBuoyWeatherDetail: new GetBuoyWeatherDetailUseCase(
            mongoBuoyRepo, cachedTideRepo, weatherBitRepo, forecastRepo, stationLocator
        )
    },
    weather: {
        getPointWeatherDetail: new GetPointWeatherDetailUseCase(
            pointWeatherRepo, cachedTideRepo, weatherBitRepo, forecastRepo, mongoBuoyRepo, stationLocator
        )
    },
    map: {
        getMapTile: new GetMapTileUseCase(mapTileRepo)
    },
    radar: {
        getRadar: new GetRadarUseCase(radarRepo)
    },
    alert: {
        getAlerts: new GetAlertsUseCase(alertRepo)
    },
    tips: {
        getWeatherTips: new GetWeatherTipsUseCase(weatherAdvisorRepo)
    }
};

/*----------------------------------------------------------------------------------*/

(async () => {
    await connectMongo()
    await startServer()
})()

/*----------------------------------------------------------------------------------*/

async function startServer() {
    const server = new Server(useCases, rateLimiter);
    await server.listen(HTTP_PORT, HTTP_HOST);
    console.log(`Soosky Weather Marine API running on http://${HTTP_HOST}:${HTTP_PORT}`);
}
