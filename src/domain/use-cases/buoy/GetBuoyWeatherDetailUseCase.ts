import BuoyWeatherRepository from "../../repositories/IBuoyWeatherRepository";
import TideRepository from "../../repositories/ITideRepository";
import WeatherBitRepository from "../../repositories/IWeatherBitRepository";
import OwmForecastRepository from "../../repositories/IOwmForecastRepository";
import StationLocator from "../../repositories/IStationLocator";
import BuoyStationRepository from "../../repositories/IBuoyStationRepository";
import { BuoyWeatherDetail } from "../../entities/BuoyWeatherDetail";
import { resilientSource } from "../resilientSource";
import { resolveTide } from "../resolveTide";

// Query = input do client truyền vào (không phải data lưu trữ) -> khai cạnh use-case.
export type BuoyWeatherDetailQuery = {
    buoyId: string;
    lat: number;
    lon: number;
    tideStationId?: string;
}

export default class GetBuoyWeatherDetailUseCase {
    constructor (
        private _buoyRepo: BuoyWeatherRepository,
        private _tideRepo: TideRepository,
        private _weatherBitRepo: WeatherBitRepository,
        private _forecastRepo: OwmForecastRepository,
        private _locator: StationLocator,
        private _stationRepo: BuoyStationRepository
    ) {}

    public async execute (query: BuoyWeatherDetailQuery): Promise<BuoyWeatherDetail> {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        // MỖI nguồn bọc resilientSource: lỗi -> null (partial) + log, KHÔNG 500.
        // tide: resolveTide (client truyền hoặc thử vài trạm gần nhất, lấy trạm đầu có data).
        const [buoy, weatherBit, forecast, tideRes] = await Promise.all([
            resilientSource('buoy', `buoy:${query.buoyId}`,
                () => this._buoyRepo.getBuoyWeather({ buoyId: query.buoyId })),
            resilientSource('weatherbit', `wbit:${query.lat},${query.lon}`,
                () => this._weatherBitRepo.getWeatherBitCurrent({ lat: query.lat, lon: query.lon })),
            resilientSource('forecast', `fcst:${query.lat},${query.lon}`,
                () => this._forecastRepo.getForecast({ lat: query.lat, lon: query.lon })),
            resolveTide(this._tideRepo, this._locator, query.tideStationId, query.lat, query.lon, today),
        ]);

        // Lazy seed vị trí buoy vào "buoys" nếu chưa có (TH3) — best-effort,
        // fire-and-forget, KHÔNG await để không thêm độ trễ cho response.
        // Chỉ insert khi thiếu, không đè vị trí chuẩn bot crawl.
        void this._stationRepo.seedIfAbsent({ buoyId: query.buoyId, name: null, lat: query.lat, lon: query.lon })
            .catch((err) => console.warn(`[buoys] lazy seed failed: ${(err as Error)?.message ?? err}`));

        return {
            buoyId: query.buoyId,
            temperature: buoy?.temperature ?? null,
            windSpeed: buoy?.windSpeed ?? null,
            windDirection: buoy?.windDirection ?? null,
            gust: buoy?.gust ?? null,
            waveHeight: buoy?.waveHeight ?? null,
            waterTemp: buoy?.waterTemp ?? null,
            atmospherePressure: buoy?.atmospherePressure ?? null,
            updatedAt: buoy?.updatedAt ?? null,
            visibility: buoy?.visibility ?? null,
            tideStationId: tideRes.tideStationId,
            tideChart: tideRes.tideChart,
            uvIndex: weatherBit?.uvIndex ?? null,
            humidity: weatherBit?.humidity ?? null,
            forecast,
        };
    }
}
