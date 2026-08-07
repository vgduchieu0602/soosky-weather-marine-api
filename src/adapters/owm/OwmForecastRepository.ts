import config, {OwmForecastSource} from '../../config'
import OwmForecastRepository, {OwmForecastQuery} from '../../domain/repositories/IOwmForecastRepository';
import {OwmForecast, HourlyForecastPoint, DailyForecastPoint} from '../../domain/entities/OwmForecast'
import {OwmWeatherEntry, PartOfDay, partOfDay, conditionCode, conditionIcon} from './owmCondition'

const OWM_FORECAST_BASE: Record<OwmForecastSource, string> = {
    'free-3h': 'https://api.openweathermap.org/data/2.5/forecast',
    'pro-hourly': 'https://pro.openweathermap.org/data/2.5/forecast/hourly'
};
// Daily Forecast 16 days — nguồn daily CHÍNH THỨC của OWM: min/max/pop/description
// do OWM tổng hợp sẵn theo ngày. Đi kèm endpoint hourly ở chế độ 'pro-hourly'
// (endpoint hourly chỉ có bước giờ, không có tổng hợp ngày).
const OWM_DAILY_16_BASE = 'https://api.openweathermap.org/data/2.5/forecast/daily';
const DAILY_DAYS = 5;
const ONE_HOUR_SECONDS = 60 * 60;
const THREE_HOURS_SECONDS = 3 * ONE_HOUR_SECONDS;

// 1 bước dữ liệu đã chuẩn hoá từ các endpoint forecast OWM.
type OwmStep = {
    dt: number;
    main?: { temp?: number; temp_min?: number; temp_max?: number };
    wind?: { speed?: number };
    pop?: number;
    weather?: OwmWeatherEntry[];
    sys?: { pod?: string };     //'d' | 'n' — part of day theo chính OWM
};

type SelectedHourlyStep = {
    step: OwmStep;
    displayTimeSec: number;
};

// Daily Forecast 16 days: gió là `speed`, nhiệt độ nằm trong `temp.min`/`temp.max`.
type OwmDaily16Step = {
    dt: number;
    temp?: {min?: number; max?: number};
    speed?: number;
    pop?: number;
    weather?: OwmWeatherEntry[];
};

// Mọi endpoint data/2.5 (/forecast, /forecast/hourly, /forecast/daily) đều trả
// `city.timezone` + `list`.
type OwmForecastListResponse<T> = {
    city?: {timezone?: number};
    list?: T[];
};

export default class OwmForecastRepositoryImpl implements OwmForecastRepository {
    public async getForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        if (config.owm.forecastSource === 'pro-hourly') return this._getProForecast(query);
        return this._getFreeForecast(query);
    }

    // Free tier: 1 endpoint 5 day/3 hour duy nhất -> hourly lấy thẳng bước 3h,
    // daily phải gộp tay từ chính các bước đó (free tier không có endpoint daily).
    private async _getFreeForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const resp = await fetch(`${OWM_FORECAST_BASE['free-3h']}?${this._queryString(query)}`);

        if (!resp.ok) {
            throw new Error(`OWM forecast request failed: HTTP ${resp.status}`);
        }

        const json = await resp.json() as OwmForecastListResponse<OwmStep>;
        const list: OwmStep[] = json.list ?? [];
        // Lệch múi giờ (giây) TẠI toạ độ được hỏi, do OWM trả sẵn. Mọi phép cắt
        // "theo ngày" dùng giờ địa phương này — không dùng UTC, cũng không dùng
        // timezone của máy chạy server.
        const tzOffsetSec = this._cityTimezone(json) ?? 0;

        return {
            lat: query.lat,
            lon: query.lon,
            timezoneOffsetSeconds: tzOffsetSec,
            hourly: this._toHourly(list, tzOffsetSec, 'free-3h'),
            daily: this._toAggregatedDaily(list, tzOffsetSec),
            updatedAt: new Date().toISOString(),
        };
    }

    // Pro: 2 endpoint song song — hourly (Hourly Forecast 4 days) cho dải giờ,
    // daily (Daily Forecast 16 days, cnt=5) cho 5 ngày. Daily lấy thẳng số OWM
    // tổng hợp, KHÔNG gộp lại từ bước giờ.
    // CẢ HAI là sản phẩm trả phí riêng — key chưa subscribe sẽ nhận HTTP 401.
    private async _getProForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const [hourlyResponse, dailyResponse] = await Promise.all([
            fetch(`${OWM_FORECAST_BASE['pro-hourly']}?${this._queryString(query)}`),
            fetch(`${OWM_DAILY_16_BASE}?${this._queryString(query)}&cnt=${DAILY_DAYS}`)
        ]);

        if (!hourlyResponse.ok || !dailyResponse.ok) {
            throw new Error(
                `OWM forecast request failed: hourly HTTP ${hourlyResponse.status}, daily HTTP ${dailyResponse.status}`
            );
        }

        const [hourlyJson, dailyJson] = await Promise.all([
            hourlyResponse.json() as Promise<OwmForecastListResponse<OwmStep>>,
            dailyResponse.json() as Promise<OwmForecastListResponse<OwmDaily16Step>>
        ]);
        const tzOffsetSec = this._cityTimezone(hourlyJson) ?? this._cityTimezone(dailyJson) ?? 0;

        return {
            lat: query.lat,
            lon: query.lon,
            timezoneOffsetSeconds: tzOffsetSec,
            hourly: this._toHourly(hourlyJson.list ?? [], tzOffsetSec, 'pro-hourly'),
            daily: this._toDaily16(dailyJson.list ?? [], tzOffsetSec),
            updatedAt: new Date().toISOString(),
        };
    }

    private _queryString(query: OwmForecastQuery): string {
        return `lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;
    }

    private _cityTimezone(json: OwmForecastListResponse<unknown>): number | null {
        return typeof json.city?.timezone === 'number' ? json.city.timezone : null;
    }

    // Các nhãn sản phẩm cách nhau 3 giờ, từ đầu giờ địa phương hiện tại + 3h.
    // Free trả sẵn bước 3h; pro trả bước 1h nên chỉ giữ các mốc rơi đúng bội số 3h.
    // Hậu tố ngày/đêm lấy theo ĐÚNG bước đó -> icon đêm cho các bước ban đêm.
    private _toHourly(
        list: OwmStep[],
        tzOffsetSec: number,
        source: OwmForecastSource
    ): HourlyForecastPoint[] {
        const nowSec = Math.floor(Date.now() / 1000);
        const firstSlotSec = this._firstForecastSlot(nowSec, tzOffsetSec, THREE_HOURS_SECONDS);
        const selectedSteps = this._selectHourlySteps(list, firstSlotSec, source);
        const today = this._localDate(nowSec, tzOffsetSec);
        let steps = selectedSteps.filter((item) =>
            this._localDate(item.displayTimeSec, tzOffsetSec) === today
        );

        // Gọi lúc đêm muộn: OWM có thể không còn bước 3h nào của hôm nay nữa ->
        // rơi về ngày sớm nhất còn dữ liệu để dải giờ không rỗng.
        const first = selectedSteps[0];
        if (steps.length === 0 && first) {
            const firstDate = this._localDate(first.displayTimeSec, tzOffsetSec);
            steps = selectedSteps.filter((item) =>
                this._localDate(item.displayTimeSec, tzOffsetSec) === firstDate
            );
        }

        return steps.map(({step, displayTimeSec}) => {
            const pod = this._partOfDay(step);
            return {
                time: new Date(displayTimeSec * 1000).toISOString(),
                temperature: step.main?.temp ?? null,
                windSpeed: step.wind?.speed ?? null,
                pop: step.pop ?? null,
                description: step.weather?.[0]?.description ?? null,
                conditionCode: this._conditionCode(step, pod),
                icon: this._icon(step, pod),
            };
        });
    }

    // Pro: bản ghi hourly rơi đúng mốc 3h. Free: mốc 3h của OWM lệch pha với mốc
    // sản phẩm (OWM chốt 00/03/06... UTC) -> gán nhãn giả lập cho bản ghi đầu tiên
    // không sớm hơn mốc, để tester có dải giờ giống production.
    private _selectHourlySteps(
        list: OwmStep[],
        firstSlotSec: number,
        source: OwmForecastSource
    ): SelectedHourlyStep[] {
        if (source === 'pro-hourly') {
            return list
                .filter((step) =>
                    step.dt >= firstSlotSec && (step.dt - firstSlotSec) % THREE_HOURS_SECONDS === 0
                )
                .map((step) => ({step, displayTimeSec: step.dt}));
        }

        const selected: SelectedHourlyStep[] = [];
        for (let displayTimeSec = firstSlotSec; ; displayTimeSec += THREE_HOURS_SECONDS) {
            const step = list.find((candidate) => candidate.dt >= displayTimeSec);
            if (!step) break;
            selected.push({step, displayTimeSec});
        }
        return selected;
    }

    // Mốc forecast đầu tiên: đầu giờ địa phương hiện tại cộng khoảng lấy mẫu của
    // nguồn, đổi ngược về Unix UTC để so trực tiếp với `list.dt` của OWM.
    private _firstForecastSlot(
        nowSec: number,
        tzOffsetSec: number,
        intervalSeconds: number
    ): number {
        const localCurrentHourSec = Math.floor((nowSec + tzOffsetSec) / ONE_HOUR_SECONDS) * ONE_HOUR_SECONDS;
        return localCurrentHourSec - tzOffsetSec + intervalSeconds;
    }

    // Daily "thật": mỗi phần tử đã là 1 ngày do OWM tổng hợp -> map 1-1, cắt
    // DAILY_DAYS ngày đầu. Ép hậu tố 'd': 1 điểm đại diện CẢ ngày.
    private _toDaily16(list: OwmDaily16Step[], tzOffsetSec: number): DailyForecastPoint[] {
        return list.slice(0, DAILY_DAYS).map((item) => {
            const conditionStep: OwmStep = {dt: item.dt, weather: item.weather};
            return {
                date: this._localDate(item.dt, tzOffsetSec),
                tempMin: item.temp?.min ?? null,
                tempMax: item.temp?.max ?? null,
                windSpeed: item.speed ?? null,
                pop: item.pop ?? null,
                description: item.weather?.[0]?.description ?? null,
                conditionCode: this._conditionCode(conditionStep, 'd'),
                icon: this._icon(conditionStep, 'd')
            };
        });
    }

    // CHỈ dùng cho 'free-3h' (free tier không có endpoint daily). Gộp các bước 3h
    // theo NGÀY ĐỊA PHƯƠNG -> tối đa DAILY_DAYS ngày. temp min/max lấy biên,
    // wind/pop lấy max (thiên về cảnh báo), description lấy bước gần 12:00 giờ địa
    // phương nhất (đại diện ban ngày).
    // Cùng mốc chia ngày với `hourly` nên `daily[0].date` luôn là ngày của dải giờ.
    private _toAggregatedDaily(list: OwmStep[], tzOffsetSec: number): DailyForecastPoint[] {
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
