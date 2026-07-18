import config from '../../config'
import OwmForecastRepository from '../../domain/repositories/IOwmForecastRepository';
import {OwmForecast, OwmForecastQuery, HourlyForecastPoint, DailyForecastPoint} from '../../domain/entities/OwmForecast'

// Gói Startup: 2 endpoint riêng, data native — không cần tự gộp 3h-step nữa
const OWM_HOURLY_BASE = 'https://pro.openweathermap.org/data/2.5/forecast/hourly';
const OWM_DAILY_BASE = 'https://api.openweathermap.org/data/2.5/forecast/daily';
const DAILY_DAYS = 5;

export default class OwmForecastRepositoryImpl implements OwmForecastRepository {
    public async getForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const [hourly, daily] = await Promise.all([
            this._fetchHourly(query),
            this._fetchDaily(query),
        ]);

        return {
            lat: query.lat,
            lon: query.lon,
            hourly,
            daily,
            updatedAt: new Date().toISOString(),
        };
    }

    private async _fetchHourly(query: OwmForecastQuery): Promise<HourlyForecastPoint[]> {
        const url = `${OWM_HOURLY_BASE}?lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;
        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`OWM hourly forecast request failed: HTTP ${resp.status}`);
        }

        const json: any = await resp.json();
        const list: any[] = json.list ?? [];

        return list.map((item) => ({
            time: new Date(item.dt * 1000).toISOString(),
            temperature: item.main?.temp ?? null,
            windSpeed: item.wind?.speed ?? null,
            pop: item.pop ?? null,
            description: item.weather?.[0]?.description ?? null,
        }));
    }

    // Response forecast/daily có shape khác forecast/hourly: temp là object {min,max,...}, wind là "speed" (không lồng trong "wind")
    private async _fetchDaily(query: OwmForecastQuery): Promise<DailyForecastPoint[]> {
        const url = `${OWM_DAILY_BASE}?lat=${query.lat}&lon=${query.lon}&cnt=${DAILY_DAYS}&appid=${config.owm.apiKey}&units=metric`;
        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`OWM daily forecast request failed: HTTP ${resp.status}`);
        }

        const json: any = await resp.json();
        const list: any[] = json.list ?? [];

        return list.map((item) => ({
            date: new Date(item.dt * 1000).toISOString().slice(0, 10),
            tempMin: item.temp?.min ?? null,
            tempMax: item.temp?.max ?? null,
            windSpeed: item.speed ?? null,
            pop: item.pop ?? null,
            description: item.weather?.[0]?.description ?? null,
        }));
    }
}
