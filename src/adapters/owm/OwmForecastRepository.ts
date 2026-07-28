import config from '../../config'
import OwmForecastRepository, {OwmForecastQuery} from '../../domain/repositories/IOwmForecastRepository';
import {OwmForecast, HourlyForecastPoint, DailyForecastPoint} from '../../domain/entities/OwmForecast'
import {OwmWeatherEntry, PartOfDay, partOfDay, conditionCode, conditionIcon} from './owmCondition'

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
    weather?: OwmWeatherEntry[];
    sys?: { pod?: string };     //'d' | 'n' — part of day theo chính OWM
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
        // Lệch múi giờ (giây) TẠI toạ độ được hỏi, do OWM trả sẵn. Mọi phép cắt
        // "theo ngày" dùng giờ địa phương này — không dùng UTC, cũng không dùng
        // timezone của máy chạy server.
        const tzOffsetSec: number = typeof json.city?.timezone === 'number' ? json.city.timezone : 0;

        return {
            lat: query.lat,
            lon: query.lon,
            hourly: this._toHourly(list, tzOffsetSec),
            daily: this._toDaily(list, tzOffsetSec),
            updatedAt: new Date().toISOString(),
        };
    }

    // Mỗi bước 3h -> 1 điểm hourly (granularity 3h là mức của gói free).
    // CHỈ giữ các bước thuộc NGÀY HÔM NAY theo giờ địa phương tại toạ độ đó —
    // FE vẽ dải giờ của hôm nay, không cần bước của ngày mai trở đi (đã có `daily`).
    // Hậu tố ngày/đêm lấy theo ĐÚNG bước đó -> icon đêm cho các bước ban đêm.
    private _toHourly(list: OwmStep[], tzOffsetSec: number): HourlyForecastPoint[] {
        const today = this._localDate(Math.floor(Date.now() / 1000), tzOffsetSec);
        let steps = list.filter((s) => this._localDate(s.dt, tzOffsetSec) === today);

        // Gọi lúc đêm muộn: OWM có thể không còn bước 3h nào của hôm nay nữa ->
        // rơi về ngày sớm nhất còn dữ liệu để dải giờ không rỗng.
        const first = list[0];
        if (steps.length === 0 && first) {
            const firstDate = this._localDate(first.dt, tzOffsetSec);
            steps = list.filter((s) => this._localDate(s.dt, tzOffsetSec) === firstDate);
        }

        return steps.map((item) => {
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

    // Gộp các bước 3h theo NGÀY ĐỊA PHƯƠNG -> tối đa 5 ngày. temp min/max lấy biên,
    // wind/pop lấy max (thiên về cảnh báo), description lấy bước gần 12:00 giờ địa
    // phương nhất (đại diện ban ngày) — endpoint free không có sẵn tổng hợp theo ngày.
    // Cùng mốc chia ngày với `hourly` nên `daily[0].date` luôn là ngày của dải giờ.
    private _toDaily(list: OwmStep[], tzOffsetSec: number): DailyForecastPoint[] {
        const byDate = new Map<string, OwmStep[]>();
        for (const item of list) {
            const date = this._localDate(item.dt, tzOffsetSec);
            const bucket = byDate.get(date);
            if (bucket) bucket.push(item);
            else byDate.set(date, [item]);
        }

        const dates = Array.from(byDate.keys()).sort().slice(0, DAILY_DAYS);

        return dates.map((date) => {
            const steps = byDate.get(date)!;
            const midday = this._middayStep(steps, tzOffsetSec);
            return {
                date,
                tempMin: this._min(steps.map((s) => s.main?.temp_min)),
                tempMax: this._max(steps.map((s) => s.main?.temp_max)),
                windSpeed: this._max(steps.map((s) => s.wind?.speed)),
                pop: this._max(steps.map((s) => s.pop)),
                description: midday?.weather?.[0]?.description ?? null,
                // Ép hậu tố 'd': 1 điểm daily đại diện CẢ ngày -> FE luôn vẽ icon ngày.
                conditionCode: midday ? this._conditionCode(midday, 'd') : null,
                icon: midday ? this._icon(midday, 'd') : null,
            };
        });
    }

    // Ngày địa phương ('YYYY-MM-DD') của 1 mốc UNIX tại toạ độ đang hỏi. Cộng
    // offset rồi đọc theo UTC — cách này không phụ thuộc timezone của server.
    private _localDate(dtSec: number, tzOffsetSec: number): string {
        return new Date((dtSec + tzOffsetSec) * 1000).toISOString().slice(0, 10);
    }

    // Giờ (0-23) theo giờ địa phương tại toạ độ đang hỏi.
    private _localHour(dtSec: number, tzOffsetSec: number): number {
        return new Date((dtSec + tzOffsetSec) * 1000).getUTCHours();
    }

    // Bước gần 12:00 GIỜ ĐỊA PHƯƠNG nhất trong ngày -> bước đại diện (description + icon).
    private _middayStep(steps: OwmStep[], tzOffsetSec: number): OwmStep | null {
        let best: OwmStep | null = null;
        let bestDiff = Infinity;
        for (const s of steps) {
            const hour = this._localHour(s.dt, tzOffsetSec);
            const diff = Math.abs(hour - 12);
            if (diff < bestDiff) {
                bestDiff = diff;
                best = s;
            }
        }
        return best;
    }

    // 3 helper dưới chỉ là wrapper mỏng quanh owmCondition.ts (dùng chung với
    // OwmCurrentRepository) — giữ chữ ký nhận `OwmStep` cho gọn chỗ gọi.
    private _partOfDay(step: OwmStep): PartOfDay {
        return partOfDay(step.weather?.[0], step.sys?.pod);
    }

    private _conditionCode(step: OwmStep, pod: PartOfDay): string | null {
        return conditionCode(step.weather?.[0], pod);
    }

    private _icon(step: OwmStep, pod: PartOfDay): string | null {
        return conditionIcon(step.weather?.[0], pod);
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
