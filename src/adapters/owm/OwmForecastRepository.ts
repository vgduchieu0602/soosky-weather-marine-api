import config, {OwmForecastSource} from '../../config'
import OwmForecastRepository, {OwmForecastQuery} from '../../domain/repositories/IOwmForecastRepository';
import {OwmForecast, HourlyForecastPoint, DailyForecastPoint} from '../../domain/entities/OwmForecast'
import {OwmWeatherEntry, PartOfDay, partOfDay, conditionCode, conditionIcon} from './owmCondition'

const OWM_FORECAST_BASE: Record<Exclude<OwmForecastSource, 'onecall-4'>, string> = {
    'free-3h': 'https://api.openweathermap.org/data/2.5/forecast',
    'pro-hourly': 'https://pro.openweathermap.org/data/2.5/forecast/hourly'
};
const OWM_ONECALL_BASE = 'https://api.openweathermap.org/data/4.0/onecall/timeline';
const DAILY_DAYS = 5;
const THREE_HOURS_SECONDS = 3 * 60 * 60;

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

type OwmOneCallHourlyStep = {
    dt: number;
    temp?: number;
    wind_speed?: number;
    pop?: number;
    weather?: OwmWeatherEntry[];
};

type OwmOneCallDailyStep = {
    dt: number;
    temp?: {min?: number; max?: number};
    wind_speed?: number;
    pop?: number;
    weather?: OwmWeatherEntry[];
};

type OwmOneCallResponse<T> = {
    timezone_offset?: number;
    data?: T[];
};

export default class OwmForecastRepositoryImpl implements OwmForecastRepository {
    public async getForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const source = config.owm.forecastSource;
        if (source === 'onecall-4') return this._getOneCallForecast(query);

        const baseUrl = OWM_FORECAST_BASE[source];
        const url = `${baseUrl}?lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;
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
            timezoneOffsetSeconds: tzOffsetSec,
            hourly: this._toHourly(list, tzOffsetSec, source),
            daily: this._toDaily(list, tzOffsetSec),
            updatedAt: new Date().toISOString(),
        };
    }

    private async _getOneCallForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const hourlyUrl = this._oneCallUrl('1h', query);
        const dailyUrl = this._oneCallUrl('1day', query);
        const [hourlyResponse, dailyResponse] = await Promise.all([
            fetch(hourlyUrl),
            fetch(dailyUrl)
        ]);

        if (!hourlyResponse.ok || !dailyResponse.ok) {
            throw new Error(
                `OWM One Call forecast request failed: hourly HTTP ${hourlyResponse.status}, daily HTTP ${dailyResponse.status}`
            );
        }

        const [hourlyJson, dailyJson] = await Promise.all([
            hourlyResponse.json() as Promise<OwmOneCallResponse<OwmOneCallHourlyStep>>,
            dailyResponse.json() as Promise<OwmOneCallResponse<OwmOneCallDailyStep>>
        ]);
        const tzOffsetSec = typeof hourlyJson.timezone_offset === 'number'
            ? hourlyJson.timezone_offset
            : typeof dailyJson.timezone_offset === 'number' ? dailyJson.timezone_offset : 0;

        return {
            lat: query.lat,
            lon: query.lon,
            timezoneOffsetSeconds: tzOffsetSec,
            hourly: this._toHourly(
                this._normalizeOneCallHourly(hourlyJson.data ?? []),
                tzOffsetSec,
                'onecall-4'
            ),
            daily: this._toOneCallDaily(dailyJson.data ?? [], tzOffsetSec),
            updatedAt: new Date().toISOString(),
        };
    }

    private _oneCallUrl(step: '1h' | '1day', query: OwmForecastQuery): string {
        return `${OWM_ONECALL_BASE}/${step}?lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;
    }

    // Các nhãn sản phẩm cách nhau 3 giờ, từ đầu giờ địa phương hiện tại + 3h.
    // Pro dùng bản ghi hourly đúng mốc; free gán nhãn giả lập cho bản ghi 3h đầu
    // tiên không sớm hơn mốc đó để tester có dải giờ giống production.
    // Hậu tố ngày/đêm lấy theo ĐÚNG bước đó -> icon đêm cho các bước ban đêm.
    private _toHourly(
        list: OwmStep[],
        tzOffsetSec: number,
        source: OwmForecastSource
    ): HourlyForecastPoint[] {
        const nowSec = Math.floor(Date.now() / 1000);
        const firstSlotSec = this._firstForecastSlot(nowSec, tzOffsetSec);
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

    private _selectHourlySteps(
        list: OwmStep[],
        firstSlotSec: number,
        source: OwmForecastSource
    ): SelectedHourlyStep[] {
        if (source !== 'free-3h') {
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

    private _normalizeOneCallHourly(list: OwmOneCallHourlyStep[]): OwmStep[] {
        return list.map((item) => ({
            dt: item.dt,
            main: {temp: item.temp},
            wind: {speed: item.wind_speed},
            pop: item.pop,
            weather: item.weather
        }));
    }

    // Mốc forecast đầu tiên: đầu giờ địa phương hiện tại cộng 3 giờ, đổi ngược
    // về Unix UTC để so trực tiếp với `list.dt` của OWM.
    private _firstForecastSlot(nowSec: number, tzOffsetSec: number): number {
        const localCurrentHourSec = Math.floor((nowSec + tzOffsetSec) / 3600) * 3600;
        return localCurrentHourSec - tzOffsetSec + THREE_HOURS_SECONDS;
    }

    private _toOneCallDaily(list: OwmOneCallDailyStep[], tzOffsetSec: number): DailyForecastPoint[] {
        return list.slice(0, DAILY_DAYS).map((item) => {
            const conditionStep: OwmStep = {dt: item.dt, weather: item.weather};
            return {
                date: this._localDate(item.dt, tzOffsetSec),
                tempMin: item.temp?.min ?? null,
                tempMax: item.temp?.max ?? null,
                windSpeed: item.wind_speed ?? null,
                pop: item.pop ?? null,
                description: item.weather?.[0]?.description ?? null,
                conditionCode: this._conditionCode(conditionStep, 'd'),
                icon: this._icon(conditionStep, 'd')
            };
        });
    }

    // Gộp các bước hourly theo NGÀY ĐỊA PHƯƠNG -> tối đa 4 ngày. temp min/max lấy biên,
    // wind/pop lấy max (thiên về cảnh báo), description lấy bước gần 12:00 giờ địa
    // phương nhất (đại diện ban ngày) — endpoint hourly không có sẵn tổng hợp theo ngày.
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
