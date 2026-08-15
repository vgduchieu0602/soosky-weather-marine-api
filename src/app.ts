import config from './config'
import Server from './http/Server'
import NoaaTidesRepository from './adapters/noaa/NoaaTideRepository';
import GetTideChartUseCase from './domain/use-cases/tide/getTideChartUseCase';
import NdbcBuoyRepository from './adapters/ndbc/NdbcBuoyRepository';
import NdbcStationSource from './adapters/ndbc/NdbcStationSource';
import MongoBuoyStationStore from './adapters/mongo/stores/MongoBuoyStationStore';
import GetBuoyWeatherDetailUseCase from './domain/use-cases/buoy/GetBuoyWeatherDetailUseCase';
import ListBuoysUseCase from './domain/use-cases/buoy/ListBuoysUseCase';

import connectMongo from './adapters/mongo/connectMongo';
import WeatherBitCurrentRepository from './adapters/weatherbit/WeatherBitCurrentRepository';
import OwmForecastRepositoryImpl from './adapters/owm/OwmForecastRepository';

import GetPointWeatherDetailUseCase from './domain/use-cases/weather/GetPointWeatherDetailUseCase';
import OwmCurrentRepository from './adapters/owm/OwmCurrentRepository';

import GetMapTileUseCase from './domain/use-cases/map/GetMapTileUseCase';
import OwmMapTileRepository from './adapters/owm/OwmMapTileRepository';
import InMemoryMapTileRepository from './adapters/cache/InMemoryMapTileRepository';
import RateLimiter from './http/RateLimiter';

import GetRadarUseCase from './domain/use-cases/radar/GetRadarUseCase';
import RainviewerRadarRepository from './adapters/rainviewer/RainviewerRadarRepository';

import GetAlertsUseCase from './domain/use-cases/alert/GetAlertsUseCase';
import WeatherBitAlertRepository from './adapters/weatherbit/WeatherBitAlertRepository';

// --- Cache stores (Mongo, thuần read/write) ---
import MongoTideCache from './adapters/mongo/stores/MongoTideCache';
import MongoBuoyWeatherCache from './adapters/mongo/stores/MongoBuoyWeatherCache';
import MongoWeatherBitCache from './adapters/mongo/stores/MongoWeatherBitCache';
import MongoOwmForecastCache from './adapters/mongo/stores/MongoOwmForecastCache';
import MongoPointWeatherCache from './adapters/mongo/stores/MongoPointWeatherCache';
import MongoRadarCache from './adapters/mongo/stores/MongoRadarCache';
import MongoAlertCache from './adapters/mongo/stores/MongoAlertCache';

// --- Cache decorators (Interface Adapters — bọc source + store bằng cache-aside) ---
import CachedTideRepository from './adapters/cache/CachedTideRepository';
import CachedBuoyWeatherRepository from './adapters/cache/CachedBuoyWeatherRepository';
import CachedWeatherBitRepository from './adapters/cache/CachedWeatherBitRepository';
import CachedOwmForecastRepository from './adapters/cache/CachedOwmForecastRepository';
import CachedPointWeatherRepository from './adapters/cache/CachedPointWeatherRepository';
import CachedRadarRepository from './adapters/cache/CachedRadarRepository';
import CachedAlertRepository from './adapters/cache/CachedAlertRepository';

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

const WEATHER_CACHE_TTL = {
    ndbc: THIRTY_MINUTES,
    weatherBitHumidity: THREE_HOURS,
    weatherBitUv: THREE_HOURS,
    owmForecast: ONE_DAY,
    owmCurrent: THIRTY_MINUTES
} as const


/*----------------------------------------------------------------------------------*/

// --- Adapter (source thật, gọi thẳng API ngoài) ---
const tideRepo = new NoaaTidesRepository()
const buoyRepo = new NdbcBuoyRepository()

// Cache-aside: source + Mongo cache store + TTL, ghép bằng caching wrapper (use-case).
// Store = persistence thuần (read/write); wrapper = orchestration (TTL/refetch).
// Cache share giữa mọi user + instance, sống sót restart. TTL theo cadence từng nguồn:
//  - buoy/point 30 phút: data đo thực tế, đổi liên tục.
//  - tide/OWM forecast 1 ngày: data 1 ngày cụ thể không đổi trong ngày.
//  - WeatherBit: humidity + uvIndex 3h (2 field vẫn tách timestamp/TTL riêng).
//    TTL đo từ mốc GHI CACHE, không từ ob_time (WeatherBit trễ 15-60 phút).
const mongoBuoyRepo = new CachedBuoyWeatherRepository(
    buoyRepo, new MongoBuoyWeatherCache(), WEATHER_CACHE_TTL.ndbc
)
// Prediction của 1 ngày cụ thể không đổi trong ngày -> TTL 1 ngày.
// (Muốn kiểm tra vòng refetch NOAA khi dev: tạm hạ xuống vài phút.)
const cachedTideRepo = new CachedTideRepository(tideRepo, new MongoTideCache(), ONE_DAY)
const weatherBitRepo = new CachedWeatherBitRepository(
    new WeatherBitCurrentRepository(), new MongoWeatherBitCache(),
    WEATHER_CACHE_TTL.weatherBitHumidity, WEATHER_CACHE_TTL.weatherBitUv
)
const forecastRepo = new CachedOwmForecastRepository(
    new OwmForecastRepositoryImpl(), new MongoOwmForecastCache(), WEATHER_CACHE_TTL.owmForecast
)
const pointWeatherRepo = new CachedPointWeatherRepository(
    new OwmCurrentRepository(), new MongoPointWeatherCache(), WEATHER_CACHE_TTL.owmCurrent
)

// Map tile: cache TTL ngắn TRONG RAM (không Mongo — ảnh nặng, không cần bền vững),
// có cap LRU để RAM không phình. Giảm gọi OWM khi pan/zoom xin lại cùng tile.
const mapTileRepo = new InMemoryMapTileRepository(new OwmMapTileRepository())
const radarRepo = new CachedRadarRepository(new RainviewerRadarRepository(), new MongoRadarCache(), TEN_MINUTES)
const alertRepo = new CachedAlertRepository(new WeatherBitAlertRepository(), new MongoAlertCache(), THIRTY_MINUTES)

// Smart Weather Tips (Gemini). KHÔNG cache (mỗi request persona/weather khác nhau,
// output ngắn) — gọi thẳng Gemini. Cần GEMINI_API_KEY trong .env.
if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is required.')
}
const weatherAdvisorRepo = new GeminiWeatherAdvisor(config.gemini.apiKey, config.gemini.model)

// Tra trạm NDBC/NOAA gần nhất theo lat/lon (auto-resolve buoyId/tideStationId) để
// giảm null — xem StationLocator.ts (cache directory in-memory 24h).
const stationLocator = new StationLocatorImpl()

// Vị trí buoy (collection "buoys" dùng chung với bot crawl). Store = đọc/lazy-seed;
// source = fallback NDBC khi DB rỗng.
const buoyStationStore = new MongoBuoyStationStore()
const buoyStationSource = new NdbcStationSource()

// Giới hạn request MỖI IP trong 1 cửa sổ (RATE_LIMIT_WINDOW_MS/RATE_LIMIT_IP_MAX).
// Không còn trần global và không còn bucket riêng cho map — xem RateLimiter.ts.
const rateLimiter = new RateLimiter(config.rateLimit.windowMs, config.rateLimit.ipMax, config.rateLimit.enabled)

// --- Use Cases ---
const useCases = {
    tide: {
        getTideChart: new GetTideChartUseCase(cachedTideRepo)
    },
    buoy: {
        getBuoyWeatherDetail: new GetBuoyWeatherDetailUseCase(
            mongoBuoyRepo, cachedTideRepo, weatherBitRepo, forecastRepo, stationLocator, buoyStationStore,
            // Dùng chung pointWeatherRepo với endpoint /weather -> cache OWM current
            // share theo lat/lon, không phát sinh call thừa.
            pointWeatherRepo
        ),
        listBuoys: new ListBuoysUseCase(buoyStationStore, buoyStationSource)
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
const server = new Server(useCases, rateLimiter, config.mapTiles.enabled);
    await server.listen(HTTP_PORT, HTTP_HOST);
    console.log(`Soosky Weather Marine API running on http://${HTTP_HOST}:${HTTP_PORT}`);
}
