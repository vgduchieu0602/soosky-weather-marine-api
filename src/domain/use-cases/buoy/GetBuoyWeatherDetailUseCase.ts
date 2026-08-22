import BuoyWeatherRepository from "../../repositories/IBuoyWeatherRepository";
import PointWeatherRepository from "../../repositories/IPointWeatherRepository";
import TideRepository from "../../repositories/ITideRepository";
import WeatherBitRepository from "../../repositories/IWeatherBitRepository";
import OwmForecastRepository from "../../repositories/IOwmForecastRepository";
import StationLocator from "../../repositories/IStationLocator";
import BuoyStationRepository from "../../repositories/IBuoyStationRepository";
import BuoyStationSource from "../../repositories/IBuoyStationSource";
import { BuoyWeatherDetail } from "../../entities/BuoyWeatherDetail";
import { resilientSource } from "../resilientSource";
import { resolveTide } from "../resolveTide";
import { resolveBuoyStation } from "../resolveBuoyStation";

type TemperatureSource = 'ndbc' | 'weatherbit' | 'owm' | null;

function resolveTemperature (
    ndbcTemperature: number | null | undefined,
    weatherBitTemperature: number | null | undefined,
    owmTemperature: number | null | undefined
): { temperature: number | null; temperatureSource: TemperatureSource } {
    if (ndbcTemperature !== null && ndbcTemperature !== undefined) {
        return { temperature: ndbcTemperature, temperatureSource: 'ndbc' };
    }
    if (weatherBitTemperature !== null && weatherBitTemperature !== undefined) {
        return { temperature: weatherBitTemperature, temperatureSource: 'weatherbit' };
    }
    if (owmTemperature !== null && owmTemperature !== undefined) {
        return { temperature: owmTemperature, temperatureSource: 'owm' };
    }
    return { temperature: null, temperatureSource: null };
}

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
        private _stationRepo: BuoyStationRepository,
        // Chỉ để lấy tình trạng thời tiết (conditionCode/icon/description) theo
        // lat/lon: NDBC là trạm đo cảm biến, không có khái niệm "trời nhiều mây".
        private _pointRepo: PointWeatherRepository,
        // Fallback metadata trạm khi DB "buoys" thiếu/chưa có name, và là nguồn
        // duy nhất được phép seed xuống DB (xem resolveBuoyStation).
        private _stationSource: BuoyStationSource
    ) {}

    public async execute (query: BuoyWeatherDetailQuery): Promise<BuoyWeatherDetail> {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        // MỖI nguồn bọc resilientSource: lỗi -> null (partial) + log, KHÔNG 500.
        // tide: resolveTide (client truyền hoặc thử vài trạm gần nhất, lấy trạm đầu có data).
        const [buoy, point, weatherBit, forecast, tideRes, resolvedStation] = await Promise.all([
            resilientSource('buoy', `buoy:${query.buoyId}`,
                () => this._buoyRepo.getBuoyWeather({ buoyId: query.buoyId })),
            resilientSource('current', `owmcur:${query.lat},${query.lon}`,
                () => this._pointRepo.getPointWeather({ lat: query.lat, lon: query.lon })),
            resilientSource('weatherbit', `wbit:${query.lat},${query.lon}`,
                () => this._weatherBitRepo.getWeatherBitCurrent({ lat: query.lat, lon: query.lon })),
            resilientSource('forecast', `fcst:${query.lat},${query.lon}`,
                () => this._forecastRepo.getForecast({ lat: query.lat, lon: query.lon })),
            resolveTide(this._tideRepo, this._locator, query.tideStationId, query.lat, query.lon, today),
            // DB thiếu tên -> tự fallback activestations.xml; lỗi -> null (đã log).
            resolveBuoyStation(this._stationRepo, this._stationSource, query.buoyId),
        ]);

        // Lazy seed trạm vào "buoys" — best-effort, fire-and-forget, KHÔNG await
        // để không thêm độ trễ cho response.
        // CHỈ ghi khi data đến từ feed: name + lat/lon là VỊ TRÍ THẬT của trạm.
        // (Bản cũ seed query.lat/query.lon = toạ độ client -> "buoys" đầy doc sai
        // vị trí, name null, và chặn luôn fallback feed của /buoys.)
        if (resolvedStation.fromFeed && resolvedStation.station) {
            void this._stationRepo.saveFromFeed(resolvedStation.station)
                .catch((err) => console.warn(`[buoys] lazy seed failed: ${(err as Error)?.message ?? err}`));
        }

        // Thứ tự key BẮT BUỘC giống GetPointWeatherDetailUseCase — 2 endpoint dùng
        // chung entity WeatherDetail, FE render bằng cùng 1 component.
        const resolvedTemperature = resolveTemperature(buoy?.temperature, weatherBit?.temperature, point?.temperature);
        return {
            buoyId: query.buoyId,
            buoyName: resolvedStation.station?.name ?? null,
            // lat/lon client truyền vào -> luôn có giá trị (Server đã validate).
            lat: query.lat,
            lon: query.lon,
            // Tình trạng thời tiết từ OWM current (NDBC không có) — giống hệt
            // nguồn của endpoint /weather nên 2 card FE hiển thị nhất quán.
            conditionCode: point?.conditionCode ?? null,
            conditionMain: point?.conditionMain ?? null,
            description: point?.description ?? null,
            icon: point?.icon ?? null,
            temperature: resolvedTemperature.temperature,
            temperatureSource: resolvedTemperature.temperatureSource,
            windSpeed: buoy?.windSpeed ?? null,
            windDirection: buoy?.windDirection ?? null,
            gust: buoy?.gust ?? null,
            waveHeight: buoy?.waveHeight ?? null,
            waterTemp: buoy?.waterTemp ?? null,
            atmospherePressure: buoy?.atmospherePressure ?? null,
            updatedAt: buoy?.updatedAt ?? null,
            visibility: buoy?.visibility ?? null,
            tideStationId: tideRes.tideStationId,
            // Trạm phao cung cấp số đo = chính buoy client yêu cầu (endpoint
            // /weather thì đây là phao gần nhất tự tra ra).
            buoyStationId: query.buoyId,
            tideChart: tideRes.tideChart,
            uvIndex: weatherBit?.uvIndex ?? null,
            humidity: weatherBit?.humidity ?? null,
            dewPoint: weatherBit?.dewPoint ?? null,
            forecast,
        };
    }
}
