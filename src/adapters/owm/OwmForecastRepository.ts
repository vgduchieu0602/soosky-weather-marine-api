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
    weather?: { id?: number; description?: string; icon?: string }[];
    sys?: { pod?: string };     //'d' | 'n' — part of day theo chính OWM
};

// Hậu tố ngày/đêm dùng cho conditionCode + icon.
type PartOfDay = 'd' | 'n';

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
    // Hậu tố ngày/đêm lấy theo ĐÚNG bước đó -> icon đêm cho các bước ban đêm.
    private _toHourly(list: OwmStep[]): HourlyForecastPoint[] {
        return list.map((item) => {
            const pod = this._partOfDay(item);
            return {
                time: new Date(item.dt * 1000).toISOString(),
                temperature: item.main?.temp ?? null,
                windSpeed: item.wind?.speed ?? null,
                pop: item.pop ?? null,
                description: item.weather?.[0]?.description ?? null,
                conditionCode: this._conditionCode(item, pod),
                icon: this._icon(item, pod),
            };
        });
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
            const midday = this._middayStep(steps);
            return {
                date,
                tempMin: this._min(steps.map((s) => s.main?.temp_min)),
                tempMax: this._max(steps.map((s) => s.main?.temp_max)),
                windSpeed: this._max(steps.map((s) => s.wind?.speed)),
                pop: this._max(steps.map((s) => s.pop)),
                description: midday?.weather?.[0]?.description ?? null,
                // Ép hậu tố 'd': 1 điểm daily đại diện CẢ ngày -> FE luôn vẽ icon ngày.
                // (bước gần 12:00 UTC có thể là ban đêm ở múi giờ lệch nhiều.)
                conditionCode: midday ? this._conditionCode(midday, 'd') : null,
                icon: midday ? this._icon(midday, 'd') : null,
            };
        });
    }

    // Bước gần 12:00 UTC nhất trong ngày -> bước đại diện (description + icon).
    private _middayStep(steps: OwmStep[]): OwmStep | null {
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
        return best;
    }

    // Ngày/đêm của 1 bước: ưu tiên hậu tố icon OWM ('02n'), fallback sys.pod.
    // Không suy ra từ giờ UTC — OWM đã tính theo giờ mọc/lặn tại toạ độ đó.
    private _partOfDay(step: OwmStep): PartOfDay {
        const fromIcon = step.weather?.[0]?.icon?.slice(-1);
        if (fromIcon === 'd' || fromIcon === 'n') return fromIcon;
        return step.sys?.pod === 'n' ? 'n' : 'd';
    }

    // Condition group id + hậu tố ngày/đêm, vd 801 -> "801d" / "801n".
    private _conditionCode(step: OwmStep, pod: PartOfDay): string | null {
        const id = step.weather?.[0]?.id;
        return typeof id === 'number' ? `${id}${pod}` : null;
    }

    // Mã icon OWM chuẩn hoá về đúng hậu tố `pod`, vd "02d" -> "02n".
    private _icon(step: OwmStep, pod: PartOfDay): string | null {
        const icon = step.weather?.[0]?.icon;
        return icon ? `${icon.slice(0, 2)}${pod}` : null;
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
