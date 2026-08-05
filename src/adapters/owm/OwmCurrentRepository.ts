import config from '../../config'
import PointWeatherRepository, {PointWeatherQuery} from '../../domain/repositories/IPointWeatherRepository'
import {PointWeather} from '../../domain/entities/PointWeather'
import {partOfDay, conditionCode, conditionIcon} from './owmCondition'
import WindDirection from '../../domain/value-objects/WindDirection';

const OWM_CURRENT_BASE = 'https://api.openweathermap.org/data/2.5/weather';

export default class OwmCurrentRepository implements PointWeatherRepository {
    public async getPointWeather (query: PointWeatherQuery): Promise<PointWeather> {
        const url = `${OWM_CURRENT_BASE}?lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;

        const res = await fetch(url)

        if (!res.ok) {
            throw new Error(`OWM current weather request failed: HTTP ${res.status}`);
        }

        const json: any = await res.json();

        // Endpoint current KHÔNG có `sys.pod` (chỉ forecast mới có) -> hậu tố
        // ngày/đêm lấy từ chính `weather[0].icon` OWM trả về.
        const weather = json.weather?.[0];
        const pod = partOfDay(weather);
        const windDirection = WindDirection.from(json.wind?.deg);

        return {
            lat: query.lat,
            lon: query.lon,
            conditionCode: conditionCode(weather, pod),
            conditionMain: weather?.main ?? null,
            description: weather?.description ?? null,
            icon: conditionIcon(weather, pod),
            windDirection: windDirection?.degrees ?? null,
            windSpeed: json.wind?.speed ?? null,
            gust: json.wind?.gust ?? null,
            // OWM current KHÔNG đo sóng/nhiệt độ nước — luôn null (chỉ buoy có).
            waveHeight: null,
            atmospherePressure: json.main?.pressure ?? null,
            temperature: json.main?.temp ?? null,
            waterTemp: null,
            // OWM trả visibility sẵn theo MÉT (SI) — khác NDBC (hải lý). Không cần
            // quy đổi. Tối đa 10000 (OWM cap ở 10km).
            visibility: json.visibility ?? null,
            // `dt` = UNIX seconds -> ms cho JS Date. Thiếu *1000 sẽ về năm 1970.
            updatedAt: json.dt ? new Date(json.dt * 1000).toISOString() : new Date().toISOString()
        }
    }
}
