import PointWeatherRepository from "../../repositories/IPointWeatherRepository";
import BuoyWeatherRepository from "../../repositories/IBuoyWeatherRepository";
import TideRepository from "../../repositories/ITideRepository";
import WeatherBitRepository from "../../repositories/IWeatherBitRepository";
import OwmForecastRepository from "../../repositories/IOwmForecastRepository";
import StationLocator from "../../repositories/IStationLocator";
import { PointWeatherDetail } from "../../entities/PointWeatherDetail";
import { resilientSource } from "../resilientSource";
import { resolveTide } from "../resolveTide";

// Query = input do client truyền vào (không phải data lưu trữ) -> khai cạnh use-case.
export type PointWeatherDetailQuery = {
    lat: number;
    lon: number;
    tideStationId?: string;
}

// ============================================================================
// GetPointWeatherDetailUseCase.ts — thời tiết tại 1 điểm bất kỳ. Current từ OWM
// (theo lat/lon). OWM current KHÔNG có waveHeight/waterTemp -> auto lấy từ buoy
// NDBC gần nhất. tide auto trạm gần nhất. Mọi nguồn resilient (lỗi -> null, 200).
// ============================================================================

export default class GetPointWeatherDetailUseCase {
    constructor (
        private _pointRepo: PointWeatherRepository,
        private _tideRepo: TideRepository,
        private _weatherBitRepo: WeatherBitRepository,
        private _forecastRepo: OwmForecastRepository,
        private _buoyRepo: BuoyWeatherRepository,
        private _locator: StationLocator
    ) {}

    public async execute (query: PointWeatherDetailQuery): Promise<PointWeatherDetail> {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        // MỖI nguồn resilient (lỗi -> null + log, KHÔNG 500). tide: resolveTide thử
        // vài trạm gần nhất. buoyEnrich: thử vài buoy gần nhất -> waveHeight/waterTemp.
        const [point, weatherBit, forecast, tideRes, buoyEnrich] = await Promise.all([
            resilientSource('current', `owmcur:${query.lat},${query.lon}`,
                () => this._pointRepo.getPointWeather({ lat: query.lat, lon: query.lon })),
            resilientSource('weatherbit', `wbit:${query.lat},${query.lon}`,
                () => this._weatherBitRepo.getWeatherBitCurrent({ lat: query.lat, lon: query.lon })),
            resilientSource('forecast', `fcst:${query.lat},${query.lon}`,
                () => this._forecastRepo.getForecast({ lat: query.lat, lon: query.lon })),
            resolveTide(this._tideRepo, this._locator, query.tideStationId, query.lat, query.lon, today),
            this._enrichBuoy(query.lat, query.lon),
        ]);

        return {
            lat: query.lat,
            lon: query.lon,
            temperature: point?.temperature ?? null,
            windSpeed: point?.windSpeed ?? null,
            windDirection: point?.windDirection ?? null,
            gust: point?.gust ?? null,
            // OWM current không đo sóng/nhiệt độ nước -> lấy từ buoy NDBC gần nhất có data.
            waveHeight: buoyEnrich.waveHeight,
            waterTemp: buoyEnrich.waterTemp,
            atmospherePressure: point?.atmospherePressure ?? null,
            updatedAt: point?.updatedAt ?? null,
            visibility: point?.visibility ?? null,
            tideStationId: tideRes.tideStationId,
            buoyStationId: buoyEnrich.buoyStationId,
            tideChart: tideRes.tideChart,
            uvIndex: weatherBit?.uvIndex ?? null,
            humidity: weatherBit?.humidity ?? null,
            forecast,
        };
    }

    // Thử LẦN LƯỢT vài buoy gần nhất: ưu tiên buoy có waveHeight thật (nhiều trạm
    // 404 hoặc thiếu cảm biến sóng). Nếu không trạm nào có sóng, dùng trạm fetch OK
    // đầu tiên (ít nhất lấy waterTemp). Tất cả resilient (lỗi -> bỏ qua, không 500).
    private async _enrichBuoy (lat: number, lon: number): Promise<{ buoyStationId: string | null; waveHeight: number | null; waterTemp: number | null }> {
        const candidates = await this._locator.nearestBuoyStations(lat, lon);
        let firstOk: { id: string; waveHeight: number | null; waterTemp: number | null } | null = null;

        for (const c of candidates) {
            const b = await resilientSource('buoy', `buoy:${c.id}`,
                () => this._buoyRepo.getBuoyWeather({ buoyId: c.id }));
            if (!b) continue;
            if (firstOk === null) firstOk = { id: c.id, waveHeight: b.waveHeight, waterTemp: b.waterTemp };
            if (b.waveHeight !== null) {
                return { buoyStationId: c.id, waveHeight: b.waveHeight, waterTemp: b.waterTemp };
            }
        }

        if (firstOk) return { buoyStationId: firstOk.id, waveHeight: firstOk.waveHeight, waterTemp: firstOk.waterTemp };
        return { buoyStationId: candidates[0]?.id ?? null, waveHeight: null, waterTemp: null };
    }
}
