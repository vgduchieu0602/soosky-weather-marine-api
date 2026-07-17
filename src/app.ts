import config from './config'
import Server from './http/Server'
import NoaaTidesRepository from './adapters/noaa/NoaaTideRepository';
import GetTideChartUseCase from './domain/use-cases/tide/getTideChartUseCase';
import NdbcBuoyRepository from './adapters/ndbc/NdbcBuoyRepository';
import GetBuoyWeatherUseCase from './domain/use-cases/buoy/GetBuoyWeatherUseCase';

/*----------------------------------------------------------------------------------*/

const {
    http: {
        port: HTTP_PORT,
        host: HTTP_HOST
    }
} = config;

/*----------------------------------------------------------------------------------*/

// --- Adapter ---
const tideRepo = new NoaaTidesRepository()
const buoyRepo = new NdbcBuoyRepository()

// --- Use Cases ---
const useCases = {
    tide: {
        getTideChart: new GetTideChartUseCase(tideRepo)
    },
    buoy: {
        getBuoyWeather: new GetBuoyWeatherUseCase(buoyRepo)
    }
};

/*----------------------------------------------------------------------------------*/

(async () => {
    await startServer()
})()

/*----------------------------------------------------------------------------------*/

async function startServer() {
    const server = new Server(useCases);
    await server.listen(HTTP_PORT, HTTP_HOST);
    console.log(`Soosky Weather Marine API running on http://${HTTP_HOST}:${HTTP_PORT}`);
}