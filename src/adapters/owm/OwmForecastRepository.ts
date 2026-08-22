import config from '../../config'
import OwmForecastRepository, {OwmForecastQuery} from '../../domain/repositories/IOwmForecastRepository';
import {OwmForecast, HourlyForecastPoint, DailyForecastPoint} from '../../domain/entities/OwmForecast'
import {OwmWeatherEntry, PartOfDay, partOfDay, conditionCode, conditionIcon} from './owmCondition'

const OWM_FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const DAILY_DAYS = 5;
const ONE_HOUR_SECONDS = 60 * 60;
const THREE_HOURS_SECONDS = 3 * ONE_HOUR_SECONDS;

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

type OwmForecastListResponse = {
    city?: {timezone?: number};
    list?: OwmStep[];
};

export default class OwmForecastRepositoryImpl implements OwmForecastRepository {
    public async getForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const resp = await fetch(`${OWM_FORECAST_URL}?${this._queryString(query)}`);

        if (!resp.ok) {
            throw new Error(`OWM forecast request failed: HTTP ${resp.status}`);
        }

        const json = await resp.json() as OwmForecastListResponse;
        const list: OwmStep[] = json.list ?? [];

        const tzOffsetSec = this._cityTimezone(json) ?? 0;

        return {
            lat: query.lat,
            lon: query.lon,
            timezoneOffsetSeconds: tzOffsetSec,
            hourly: this._toHourly(list, tzOffsetSec),
            daily: this._toAggregatedDaily(list, tzOffsetSec),
            updatedAt: new Date().toISOString(),
        };
    }

    private _queryString(query: OwmForecastQuery): string {
        return `lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;
    }

    private _cityTimezone(json: OwmForecastListResponse): number | null {
        return typeof json.city?.timezone === 'number' ? json.city.timezone : null;
    }

    private _toHourly(list: OwmStep[], tzOffsetSec: number): HourlyForecastPoint[] {
        const nowSec = Math.floor(Date.now() / 1000);
        const firstSlotSec = this._firstForecastSlot(nowSec, tzOffsetSec, THREE_HOURS_SECONDS);
        const selectedSteps = this._selectHourlySteps(list, firstSlotSec);
        const today = this._localDate(nowSec, tzOffsetSec);
        let steps = selectedSteps.filter((item) =>
            this._localDate(item.displayTimeSec, tzOffsetSec) === today
        );

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

    private _selectHourlySteps(list: OwmStep[], firstSlotSec: number): SelectedHourlyStep[] {
        const selected: SelectedHourlyStep[] = [];
        for (let displayTimeSec = firstSlotSec; ; displayTimeSec += THREE_HOURS_SECONDS) {
            const step = list.find((candidate) => candidate.dt >= displayTimeSec);
            if (!step) break;
            selected.push({step, displayTimeSec});
        }
        return selected;
    }

    private _firstForecastSlot(
        nowSec: number,
        tzOffsetSec: number,
        intervalSeconds: number
    ): number {
        const localCurrentHourSec = Math.floor((nowSec + tzOffsetSec) / ONE_HOUR_SECONDS) * ONE_HOUR_SECONDS;
        return localCurrentHourSec - tzOffsetSec + intervalSeconds;
    }

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

    private _localDate(dtSec: number, tzOffsetSec: number): string {
        return new Date((dtSec + tzOffsetSec) * 1000).toISOString().slice(0, 10);
    }

    private _localHour(dtSec: number, tzOffsetSec: number): number {
        return new Date((dtSec + tzOffsetSec) * 1000).getUTCHours();
    }

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
