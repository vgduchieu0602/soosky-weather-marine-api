import config, { MissingEnvVarError } from './config';
import Server from './http/Server';
import connectMongo from './adapters/mongo/connectMongo';

// Upstream sources
import NoaaTidesRepository from './adapters/noaa/NoaaTideRepository';
import NdbcBuoyRepository from './adapters/ndbc/NdbcBuoyRepository';
import NdbcStationSource from './adapters/ndbc/NdbcStationSource';
import OwmCurrentRepository from './adapters/owm/OwmCurrentRepository';
import OwmForecastRepository from './adapters/owm/OwmForecastRepository';
import OwmMapTileRepository from './adapters/owm/OwmMapTileRepository';
import WeatherBitCurrentRepository from './adapters/weatherbit/WeatherBitCurrentRepository';
import WeatherBitAlertRepository from './adapters/weatherbit/WeatherBitAlertRepository';
import RainviewerRadarRepository from './adapters/rainviewer/RainviewerRadarRepository';
import GeminiWeatherAdvisor from './adapters/gemini/GeminiWeatherAdvisor';
import StationLocator from './adapters/station/StationLocator';

// Mongo stores
import MongoBuoyStationStore from './adapters/mongo/stores/MongoBuoyStationStore';
import MongoTideCache from './adapters/mongo/stores/MongoTideCache';
import MongoBuoyWeatherCache from './adapters/mongo/stores/MongoBuoyWeatherCache';
import MongoWeatherBitCache from './adapters/mongo/stores/MongoWeatherBitCache';
import MongoOwmForecastCache from './adapters/mongo/stores/MongoOwmForecastCache';
import MongoPointWeatherCache from './adapters/mongo/stores/MongoPointWeatherCache';
import MongoRadarCache from './adapters/mongo/stores/MongoRadarCache';
import MongoAlertCache from './adapters/mongo/stores/MongoAlertCache';

// Cache decorators (bọc source + store bằng cache-aside)
import CachedTideRepository from './adapters/cache/CachedTideRepository';
import CachedBuoyWeatherRepository from './adapters/cache/CachedBuoyWeatherRepository';
import CachedWeatherBitRepository from './adapters/cache/CachedWeatherBitRepository';
import CachedOwmForecastRepository from './adapters/cache/CachedOwmForecastRepository';
import CachedPointWeatherRepository from './adapters/cache/CachedPointWeatherRepository';
import CachedRadarRepository from './adapters/cache/CachedRadarRepository';
import CachedAlertRepository from './adapters/cache/CachedAlertRepository';
import InMemoryMapTileRepository from './adapters/cache/InMemoryMapTileRepository';
import InMemoryBuoyStationSource from './adapters/cache/InMemoryBuoyStationSource';

// Use-cases
import GetTideChartUseCase from './domain/use-cases/tide/getTideChartUseCase';
import GetBuoyWeatherDetailUseCase from './domain/use-cases/buoy/GetBuoyWeatherDetailUseCase';
import ListBuoysUseCase from './domain/use-cases/buoy/ListBuoysUseCase';
import GetPointWeatherDetailUseCase from './domain/use-cases/weather/GetPointWeatherDetailUseCase';
import GetMapTileUseCase from './domain/use-cases/map/GetMapTileUseCase';
import GetRadarUseCase from './domain/use-cases/radar/GetRadarUseCase';
import GetAlertsUseCase from './domain/use-cases/alert/GetAlertsUseCase';
import GetWeatherTipsUseCase from './domain/use-cases/tips/GetWeatherTipsUseCase';

const CACHE_TTL_MS = {
    tide:        24 * 60 * 60 * 1000,
    buoy:        30 * 60 * 1000,
    weatherBit:   3 * 60 * 60 * 1000,
    owmForecast: 24 * 60 * 60 * 1000,
    owmCurrent:  30 * 60 * 1000,
    radar:       10 * 60 * 1000,
    alert:       30 * 60 * 1000,
} as const;

// Ba key bắt buộc để API chạy đúng. Guard ở đây, không ở config.ts: worker
// buoySync cũng import config nhưng chỉ cần Mongo + NDBC, không nên chết vì
// thiếu key của provider nó không dùng.
if (!config.gemini.apiKey) throw new MissingEnvVarError('GEMINI_API_KEY');
if (!config.owm.apiKey) throw new MissingEnvVarError('OWM_API_KEY');
if (!config.weatherBit.apiKey) throw new MissingEnvVarError('WEATHERBIT_API_KEY');

// --- Adapters ---
const tideRepo = new CachedTideRepository(
    new NoaaTidesRepository(), new MongoTideCache(), CACHE_TTL_MS.tide,
);
const buoyWeatherRepo = new CachedBuoyWeatherRepository(
    new NdbcBuoyRepository(), new MongoBuoyWeatherCache(), CACHE_TTL_MS.buoy,
);
const weatherBitRepo = new CachedWeatherBitRepository(
    new WeatherBitCurrentRepository(), new MongoWeatherBitCache(),
    CACHE_TTL_MS.weatherBit, CACHE_TTL_MS.weatherBit,
);
const forecastRepo = new CachedOwmForecastRepository(
    new OwmForecastRepository(), new MongoOwmForecastCache(), CACHE_TTL_MS.owmForecast,
);
const pointWeatherRepo = new CachedPointWeatherRepository(
    new OwmCurrentRepository(), new MongoPointWeatherCache(), CACHE_TTL_MS.owmCurrent,
);
const radarRepo = new CachedRadarRepository(
    new RainviewerRadarRepository(), new MongoRadarCache(), CACHE_TTL_MS.radar,
);
const alertRepo = new CachedAlertRepository(
    new WeatherBitAlertRepository(), new MongoAlertCache(), CACHE_TTL_MS.alert,
);
const mapTileRepo = new InMemoryMapTileRepository(new OwmMapTileRepository());
const weatherAdvisorRepo = new GeminiWeatherAdvisor(config.gemini.apiKey, config.gemini.model);

const stationLocator = new StationLocator();
const buoyStationStore = new MongoBuoyStationStore();
// Dùng CHUNG 1 instance cho cả list (fallback lúc DB rỗng) và detail (fallback
// tên trạm) -> 1 cache in-memory phục vụ cả hai. timeoutMs ngắn hơn default 15s
// vì detail nằm trong đường phản hồi của user.
const buoyStationSource = new InMemoryBuoyStationSource(
    new NdbcStationSource({
        url: config.ndbc.activeStationsUrl,
        timeoutMs: 8000,
        retries: 0,
    }),
);

// --- Use-cases ---
const useCases = {
    tide: {
        getTideChart: new GetTideChartUseCase(tideRepo),
    },
    buoy: {
        getBuoyWeatherDetail: new GetBuoyWeatherDetailUseCase(
            buoyWeatherRepo, tideRepo, weatherBitRepo, forecastRepo,
            stationLocator, buoyStationStore, pointWeatherRepo, buoyStationSource,
        ),
        listBuoys: new ListBuoysUseCase(buoyStationStore, buoyStationSource),
    },
    weather: {
        getPointWeatherDetail: new GetPointWeatherDetailUseCase(
            pointWeatherRepo, tideRepo, weatherBitRepo, forecastRepo,
            buoyWeatherRepo, stationLocator,
        ),
    },
    map:   { getMapTile: new GetMapTileUseCase(mapTileRepo) },
    radar: { getRadar: new GetRadarUseCase(radarRepo) },
    alert: { getAlerts: new GetAlertsUseCase(alertRepo) },
    tips:  { getWeatherTips: new GetWeatherTipsUseCase(weatherAdvisorRepo) },
};

const server = new Server(useCases, config.mapTiles.enabled);

(async () => {
    await connectMongo({ maxPoolSize: config.mongo.maxPoolSize });
    await server.listen(config.http.port, config.http.host);
    console.log(`Soosky Weather Marine API running on http://${config.http.host}:${config.http.port}`);
})();
