import config from '../../config'
import OwmForecastRepository, {OwmForecastQuery} from '../../domain/repositories/IOwmForecastRepository';
import {OwmForecast, HourlyForecastPoint, DailyForecastPoint} from '../../domain/entities/OwmForecast'

// Endpoint FREE: 5-day / 3-hour forecast (nằm trong gói free OWM). Thay cho 2
// endpoint trả phí cũ (pro hourly + forecast/daily 16 ngày) từng gây 401. Trả 1
// list ~40 bước 3 giờ; tự tách ra `hourly` (dùng thẳng từng bước) + gộp thành
// `daily` (5 ngày) để giữ nguyên shape OwmForecast.
const OWM_FORECAST_BASE = 'https://api.openweathermap.org/data/2.5/forecast';
const DAILY_DAYS = 5;

// 1 bước dữ liệu thô trong `list` của OWM 5-day/3h forecast.
type OwmStep = {
    dt: number;
    main?: { temp?: number; temp_min?: number; temp_max?: number };
    wind?: { speed?: number };
    pop?: number;
    weather?: { description?: string }[];
};

export default class OwmForecastRepositoryImpl implements OwmForecastRepository {
    public async getForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const url = `${OWM_FORECAST_BASE}?lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;
        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`OWM forecast request failed: HTTP ${resp.status}`);
        }

        const json: any = await resp.json();
        const list: OwmStep[] = json.list ?? [];

        return {
            lat: query.lat,
            lon: query.lon,
            hourly: this._toHourly(list),
            daily: this._toDaily(list),
            updatedAt: new Date().toISOString(),
        };
    }

    // Mỗi bước 3h -> 1 điểm hourly (granularity 3h là mức của gói free).
    private _toHourly(list: OwmStep[]): HourlyForecastPoint[] {
        return list.map((item) => ({
            time: new Date(item.dt * 1000).toISOString(),
            temperature: item.main?.temp ?? null,
            windSpeed: item.wind?.speed ?? null,
            pop: item.pop ?? null,
            description: item.weather?.[0]?.description ?? null,
        }));
    }

    // Gộp các bước 3h theo NGÀY (UTC) -> tối đa 5 ngày. temp min/max lấy biên,
    // wind/pop lấy max (thiên về cảnh báo), description lấy bước gần 12:00 UTC nhất
    // (đại diện ban ngày) — vì endpoint free không có sẵn tổng hợp theo ngày.
    private _toDaily(list: OwmStep[]): DailyForecastPoint[] {
        const byDate = new Map<string, OwmStep[]>();
        for (const item of list) {
            const date = new Date(item.dt * 1000).toISOString().slice(0, 10);
            const bucket = byDate.get(date);
            if (bucket) bucket.push(item);
            else byDate.set(date, [item]);
        }

        const dates = Array.from(byDate.keys()).sort().slice(0, DAILY_DAYS);

        return dates.map((date) => {
            const steps = byDate.get(date)!;
            return {
                date,
                tempMin: this._min(steps.map((s) => s.main?.temp_min)),
                tempMax: this._max(steps.map((s) => s.main?.temp_max)),
                windSpeed: this._max(steps.map((s) => s.wind?.speed)),
                pop: this._max(steps.map((s) => s.pop)),
                description: this._middayDescription(steps),
            };
        });
    }

    // Bước gần 12:00 UTC nhất trong ngày -> mô tả đại diện.
    private _middayDescription(steps: OwmStep[]): string | null {
        let best: OwmStep | null = null;
        let bestDiff = Infinity;
        for (const s of steps) {
            const hour = new Date(s.dt * 1000).getUTCHours();
            const diff = Math.abs(hour - 12);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = s;
            }
        }
        return best?.weather?.[0]?.description ?? null;
    }

    private _min(values: (number | undefined)[]): number | null {
        const nums = values.filter((v): v is number => typeof v === 'number');
        return nums.length ? Math.min(...nums) : null;
    }

    private _max(values: (number | undefined)[]): number | null {
        const nums = values.filter((v): v is number => typeof v === 'number');
        return nums.length ? Math.max(...nums) : null;
    }
}
