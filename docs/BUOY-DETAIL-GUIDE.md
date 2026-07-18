# Hướng dẫn tự code: Feature "Buoy Weather Detail" (buoy + tide + uvIndex/humidity + forecast, Mongo cache-aside)

Mục tiêu: biến `GET /api/v1/buoys/:buoyId/weather` thành endpoint tổng hợp, trả:

- Field NDBC cũ (windDirection, windSpeed, gust, waveHeight, atmospherePressure, temperature, waterTemp, visibility, updatedAt) — đọc từ **MongoDB**, chỉ gọi NDBC lại khi data trong Mongo đã quá 30 phút. Không có job nền nào chạy — mọi refresh xảy ra đúng lúc có request thật.
- `tideChart` (NOAA Tides, optional qua `tideStationId`) — cache TTL 24h.
- `uvIndex`, `humidity` (WeatherBit current) — 2 cadence khác nhau: 1h và 3h, cùng 1 API call.
- `forecast.daily` (5 ngày) + `forecast.hourly` — gói OWM **Startup** (đã đăng ký): `forecast/daily` (16 Day Forecast) + `forecast/hourly` (Hourly Forecast 4 days), 2 call riêng, cache TTL 24h.

> Tự gõ theo thứ tự. Guide dài vì gộp nhiều mảnh — làm xong 1 bước, chạy `npx tsc --noEmit` rồi mới sang bước sau.

---

## Bối cảnh: vì sao KHÔNG dùng cron?

Bản đầu của guide này dùng `node-cron` chạy nền mỗi 30 phút, fetch lại **toàn bộ** buoyId đã từng lưu trong Mongo. Vấn đề khi chạy trên server tài nguyên thấp (mobile backend, RAM/CPU giới hạn):

- Cron fetch **mọi** buoyId từng có, kể cả buoy không còn ai xem — lãng phí CPU/network/quota cho data không ai cần.
- Cron là 1 timer sống suốt vòng đời process. Nếu sau này scale nhiều instance, **mỗi instance chạy 1 cron riêng** → fetch trùng lặp, tốn quota gấp N lần.
- Thêm 1 dependency (`node-cron`) + 1 tiến trình nền phải luôn chạy — không hợp môi trường ít tài nguyên, dễ restart.

**Thay bằng "cache-aside theo yêu cầu" (lazy refresh):** không có job nào chạy nền. Mỗi khi FE gọi API, code tự kiểm tra data trong Mongo còn "tươi" (dưới 30 phút) không:
- Còn tươi → trả thẳng từ Mongo, không gọi NDBC.
- Hết hạn hoặc chưa từng có → gọi NDBC 1 lần, ghi đè vào Mongo, trả kết quả mới.

Lợi ích: chỉ tốn API call cho đúng buoy đang thực sự được hỏi, đúng lúc cần refresh — không phí tài nguyên cho buoy không ai xem, không cần giữ tiến trình nền, chạy tốt trên server yếu, và scale nhiều instance vẫn an toàn (mỗi instance tự kiểm tra Mongo, hiếm khi đụng nhau, có đụng cũng chỉ ghi đè trùng — không hỏng data).

**Vì sao không dùng seebuoy (Python):** seebuoy chỉ là wrapper gọi cùng NOAA/NDBC text endpoint mà `NdbcBuoyRepository` đã tự parse rồi. Kéo Python runtime vào project Node/TS thuần chỉ để lấy lại data đã có sẵn logic — không đáng, thêm điểm lỗi (subprocess, môi trường Python, IPC).

---

## Kiến trúc tổng thể

```
GetBuoyWeatherDetailUseCase
        │
        ├── BuoyWeatherRepository (interface)          ← đọc Mongo, refetch NDBC nếu hết hạn/trống (cache-aside, KHÔNG cron)
        ├── TideRepository (interface, cached 24h)      ← optional, qua tideStationId
        ├── WeatherBitRepository (interface, dual-TTL)  ← uvIndex 3h, humidity 1h
        └── OwmForecastRepository (interface, cached 24h) ← daily + hourly, 1 call
```

Thứ tự code (từ trong ra ngoài, entity trước):

1. Cài dependency (mongoose)
2. Kết nối Mongo — `src/adapters/mongo/connectMongo.ts`
3. Mongoose model — `src/adapters/mongo/models/BuoyWeatherCacheModel.ts`
4. Entity mới — `WeatherBitCurrent`, `OwmForecast`, `BuoyWeatherDetail`
5. Repository interfaces mới — `IWeatherBitRepository`, `IOwmForecastRepository`
6. Adapter Mongo cho buoy (cache-aside: đọc DB, refetch NDBC nếu hết hạn) — `MongoBuoyWeatherRepository`
7. Adapter WeatherBit (uv+humidity) — `WeatherBitCurrentRepository`
8. Adapter OWM forecast — `OwmForecastRepository`
9. Cache decorators (TtlCache, Cached* cho tide/weatherbit/forecast)
10. Use-case tổng hợp — `GetBuoyWeatherDetailUseCase`
11. Server — route + controller
12. app.ts — wiring + connect Mongo
13. Test

---

## Bước 1 — Cài dependency

```bash
npm install mongoose
```

---

## Bước 2 — Kết nối Mongo: `src/adapters/mongo/connectMongo.ts`

**Làm gì:** 1 hàm connect dùng `config.mongo.uri`, gọi 1 lần lúc khởi động app. Đặt trong `adapters/mongo/` (không phải thư mục `db/` riêng ở gốc `src/`) — theo hexagonal, "biết Mongo là gì" thuộc về adapter layer, không phải 1 tầng ngang hàng với `domain`/`http`.

```typescript
import mongoose from 'mongoose';
import config from '../../config';

export { connectMongo as default };

async function connectMongo(): Promise<void> {
    if (!config.mongo.uri) {
        throw new Error('MONGO_URI is required.');
    }
    await mongoose.connect(config.mongo.uri);
    console.log('Mongo connected.');
}
```

---

## Bước 3 — Mongoose model: `src/adapters/mongo/models/BuoyWeatherCacheModel.ts`

**Làm gì:** khai báo schema lưu 1 "bản ghi mới nhất" theo buoyId (upsert, không phải lưu lịch sử vô hạn — nếu sau này cần lịch sử/so sánh thì đổi `upsert` thành `insert` + query theo thời gian, nhưng scope hiện tại là "lấy nhanh theo buoyId", DB không phình vì luôn ghi đè cùng 1 document/buoyId). Đặt tên `Cache` chứ không phải `Reading` — đây là bản cache mới nhất, không phải log lịch sử đo đạc.

```typescript
import { Schema, model } from 'mongoose';

export interface BuoyWeatherCacheDoc {
    buoyId: string;
    windDirection: number | null;
    windSpeed: number | null;
    gust: number | null;
    waveHeight: number | null;
    atmospherePressure: number | null;
    temperature: number | null;
    waterTemp: number | null;
    visibility: number | null;
    updatedAt: string;
}

const schema = new Schema<BuoyWeatherCacheDoc>({
    buoyId: { type: String, required: true, unique: true, index: true },
    windDirection: { type: Number, default: null },
    windSpeed: { type: Number, default: null },
    gust: { type: Number, default: null },
    waveHeight: { type: Number, default: null },
    atmospherePressure: { type: Number, default: null },
    temperature: { type: Number, default: null },
    waterTemp: { type: Number, default: null },
    visibility: { type: Number, default: null },
    updatedAt: { type: String, required: true },
});

export default model<BuoyWeatherCacheDoc>('BuoyWeatherCache', schema);
```

**Vì sao `unique: true` trên `buoyId`:** mỗi buoy chỉ giữ 1 document mới nhất — `findOneAndUpdate(..., {upsert: true})` ghi đè, không insert chồng chất.

> Nếu muốn dùng `create-model` skill cho việc này ở project khác, làm y hệt bước này — skill chỉ sinh khung schema, logic domain vẫn tự viết.

---

## Bước 4 — Entity mới

### `src/domain/entities/WeatherBitCurrent.ts`
```typescript
export type WeatherBitQuery = { lat: number; lon: number };

export interface WeatherBitCurrent {
    lat: number;
    lon: number;
    uvIndex:   number | null; // data[0].uv  — 0-11+
    humidity:  number | null; // data[0].rh  — %
    updatedAt: string;        // ISO UTC, data[0].ts * 1000
}
```

### `src/domain/entities/OwmForecast.ts`
```typescript
export type OwmForecastQuery = { lat: number; lon: number };

export interface HourlyForecastPoint {
    time: string;
    temperature: number | null;
    windSpeed:   number | null;
    pop:         number | null; // xác suất mưa 0-1
    description: string | null;
}

export interface DailyForecastPoint {
    date: string; // YYYY-MM-DD
    tempMin: number | null;
    tempMax: number | null;
    windSpeed: number | null;
    pop: number | null;
    description: string | null;
}

export interface OwmForecast {
    lat: number;
    lon: number;
    hourly: HourlyForecastPoint[];
    daily:  DailyForecastPoint[];
    updatedAt: string;
}
```

### `src/domain/entities/BuoyWeatherDetail.ts`
```typescript
import { TideChart } from './TideChart';
import { OwmForecast } from './OwmForecast';

export type BuoyWeatherDetailQuery = {
    buoyId: string;
    lat: number;
    lon: number;
    tideStationId?: string;
};

export interface BuoyWeatherDetail {
    buoyId: string;
    windDirection:      number | null;
    windSpeed:          number | null;
    gust:               number | null;
    waveHeight:         number | null;
    atmospherePressure: number | null;
    temperature:        number | null;
    waterTemp:          number | null;
    visibility:         number | null;
    updatedAt:          string;

    tideChart: TideChart | null;
    uvIndex:   number | null;
    humidity:  number | null;
    forecast:  OwmForecast | null;
}
```

**Nhớ:** `BuoyWeather.ts` cũ giữ nguyên, không sửa — entity mới compose chứ không thay thế (route cũ có thể vẫn tồn tại song song, hoặc bạn thay hẳn — tuỳ bạn quyết định sau khi test xong).

---

## Bước 5 — Repository interfaces mới

### `src/domain/repositories/IWeatherBitRepository.ts`
```typescript
import { WeatherBitCurrent, WeatherBitQuery } from "../entities/WeatherBitCurrent";

export default interface WeatherBitRepository {
    getWeatherBitCurrent(query: WeatherBitQuery): Promise<WeatherBitCurrent>;
}
```

### `src/domain/repositories/IOwmForecastRepository.ts`
```typescript
import { OwmForecast, OwmForecastQuery } from "../entities/OwmForecast";

export default interface OwmForecastRepository {
    getForecast(query: OwmForecastQuery): Promise<OwmForecast>;
}
```

`IBuoyWeatherRepository.ts` đã có sẵn, dùng lại nguyên — chỉ đổi **implementation** (Mongo cache-aside thay vì gọi NDBC trực tiếp), interface không đổi. Đây chính là lý do dùng interface từ đầu: đổi nguồn không đụng use-case.

---

## Bước 6 — Adapter Mongo cho buoy (cache-aside theo TTL): `src/adapters/mongo/MongoBuoyWeatherRepository.ts`

**Làm gì:** đọc Mongo trước. Nếu **không có** document, hoặc có nhưng `updatedAt` đã **quá 30 phút** → gọi `NdbcBuoyRepository` (đã có sẵn), ghi đè vào Mongo, trả kết quả mới. Nếu còn trong hạn → trả thẳng từ Mongo, không đụng NDBC. Đây là toàn bộ cơ chế "refresh" — không cần job nền nào khác.

```typescript
import BuoyWeatherRepository from "../../domain/repositories/IBuoyWeatherRepository";
import { BuoyWeather, BuoyQuery } from "../../domain/entities/BuoyWeather";
import BuoyWeatherCacheModel from "./models/BuoyWeatherCacheModel";

export { MongoBuoyWeatherRepository as default };

class MongoBuoyWeatherRepository implements BuoyWeatherRepository {
    constructor(
        private _inner: BuoyWeatherRepository, // NdbcBuoyRepository cũ, dùng khi cần refetch
        private _ttlMs: number
    ) {}

    public async getBuoyWeather(query: BuoyQuery): Promise<BuoyWeather> {
        const doc = await BuoyWeatherCacheModel.findOne({ buoyId: query.buoyId }).lean();

        if (doc && this._isFresh(doc.updatedAt)) {
            return {
                buoyId: doc.buoyId,
                windDirection: doc.windDirection,
                windSpeed: doc.windSpeed,
                gust: doc.gust,
                waveHeight: doc.waveHeight,
                atmospherePressure: doc.atmospherePressure,
                temperature: doc.temperature,
                waterTemp: doc.waterTemp,
                visibility: doc.visibility,
                updatedAt: doc.updatedAt,
            };
        }

        // Trống hoặc hết hạn: gọi NDBC, ghi đè Mongo (upsert), trả kết quả mới
        const fresh = await this._inner.getBuoyWeather(query);

        await BuoyWeatherCacheModel.findOneAndUpdate(
            { buoyId: query.buoyId },
            { $set: fresh },
            { upsert: true }
        );

        return fresh;
    }

    private _isFresh(updatedAt: string): boolean {
        const ageMs = Date.now() - new Date(updatedAt).getTime();
        return ageMs < this._ttlMs;
    }
}
```

**Cần hiểu:**
- `.lean()` — trả plain object thay vì Mongoose Document, nhanh hơn khi chỉ đọc.
- `_ttlMs` truyền từ ngoài vào (app.ts) — ví dụ `30 * 60 * 1000` — không hard-code trong class, dễ đổi/test.
- Không cần job nền, không cần biết trước danh sách buoyId nào — mỗi buoyId tự "sống" theo đúng nhịp request thật của nó. Đây vẫn là **Fallback/cache-aside pattern** giống `FallbackWeatherRepository` (POINT-WEATHER-GUIDE) — thử nguồn nhanh (Mongo) trước, hết hạn/rỗng mới đụng nguồn chậm (NDBC).

---

## Bước 7 — Adapter WeatherBit (uv + humidity): `src/adapters/weatherbit/WeatherBitCurrentRepository.ts`

```typescript
import config from "../../config";
import WeatherBitRepository from "../../domain/repositories/IWeatherBitRepository";
import { WeatherBitCurrent, WeatherBitQuery } from "../../domain/entities/WeatherBitCurrent";

export { WeatherBitCurrentRepository as default };

const WEATHERBIT_BASE = "https://api.weatherbit.io/v2.0/current";

class WeatherBitCurrentRepository implements WeatherBitRepository {
    public async getWeatherBitCurrent(query: WeatherBitQuery): Promise<WeatherBitCurrent> {
        const url = `${WEATHERBIT_BASE}?lat=${query.lat}&lon=${query.lon}&key=${config.weatherBit.apiKey}`;
        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`WeatherBit request failed: HTTP ${resp.status}`);
        }

        const json: any = await resp.json();
        const d = json.data?.[0];

        if (!d) {
            throw new Error("WeatherBit returned no data.");
        }

        return {
            lat: query.lat,
            lon: query.lon,
            uvIndex:  d.uv ?? null,
            humidity: d.rh ?? null,
            updatedAt: new Date(d.ts * 1000).toISOString(),
        };
    }
}
```

Giống mẫu ở POINT-WEATHER-GUIDE nhưng lấy field khác (`uv`, `rh` thay vì `temp`, `pres`...).

---

## Bước 8 — Adapter OWM forecast: `src/adapters/owm/OwmForecastRepository.ts`

**Làm gì:** bạn đã đăng ký gói **Startup** — dùng thẳng 2 endpoint native, không cần tự gộp/xấp xỉ nữa:
- `forecast/hourly` (Hourly Forecast 4 days) — domain riêng `pro.openweathermap.org` (khác domain `api.openweathermap.org` của các API khác, đúng theo docs OWM).
- `forecast/daily` (16 Day Forecast) — dùng `cnt=5` để giới hạn đúng 5 ngày.

2 response có shape khác nhau: `forecast/hourly` giống `data/2.5/forecast` cũ (`item.main.temp`, `item.wind.speed`); `forecast/daily` thì `item.temp.min/max` (object) và `item.speed` (không lồng trong `wind`). Gọi song song bằng `Promise.all`.

```typescript
import config from "../../config";
import OwmForecastRepository from "../../domain/repositories/IOwmForecastRepository";
import { OwmForecast, OwmForecastQuery, HourlyForecastPoint, DailyForecastPoint } from "../../domain/entities/OwmForecast";

export { OwmForecastRepositoryImpl as default };

const OWM_HOURLY_BASE = "https://pro.openweathermap.org/data/2.5/forecast/hourly";
const OWM_DAILY_BASE = "https://api.openweathermap.org/data/2.5/forecast/daily";
const DAILY_DAYS = 5;

class OwmForecastRepositoryImpl implements OwmForecastRepository {
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
```

**Cần hiểu:** `forecast/hourly` dùng domain `pro.openweathermap.org` (không phải `api.openweathermap.org`) — gõ nhầm domain là lỗi hay gặp nhất ở bước này, gọi sẽ ra 401 dù key đúng. `cnt=5` giới hạn daily đúng 5 ngày thay vì mặc định 16.

---

## Bước 9 — Cache decorators

### `src/adapters/cache/TtlCache.ts`
```typescript
export { TtlCache as default };

interface Entry<V> { value: V; expiresAt: number; }

class TtlCache<V> {
    private _store = new Map<string, Entry<V>>();

    public get(key: string): V | undefined {
        const entry = this._store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this._store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    public set(key: string, value: V, ttlMs: number): void {
        this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
}
```

### `src/adapters/cache/CachedTideRepository.ts`
```typescript
import TideRepository from "../../domain/repositories/ITideRepository";
import { TideChart, TideQuery } from "../../domain/entities/TideChart";
import TtlCache from "./TtlCache";

export { CachedTideRepository as default };

const ONE_DAY = 24 * 60 * 60 * 1000;

class CachedTideRepository implements TideRepository {
    private _cache = new TtlCache<TideChart>();

    constructor(private _inner: TideRepository) {}

    public async getTideChart(query: TideQuery): Promise<TideChart> {
        const key = `${query.stationId}:${query.date}:${query.days ?? 1}`;
        const cached = this._cache.get(key);
        if (cached) return cached;

        const fresh = await this._inner.getTideChart(query);
        this._cache.set(key, fresh, ONE_DAY);
        return fresh;
    }
}
```

### `src/adapters/cache/CachedOwmForecastRepository.ts`
```typescript
import OwmForecastRepository from "../../domain/repositories/IOwmForecastRepository";
import { OwmForecast, OwmForecastQuery } from "../../domain/entities/OwmForecast";
import TtlCache from "./TtlCache";

export { CachedOwmForecastRepository as default };

const ONE_DAY = 24 * 60 * 60 * 1000;

class CachedOwmForecastRepository implements OwmForecastRepository {
    private _cache = new TtlCache<OwmForecast>();

    constructor(private _inner: OwmForecastRepository) {}

    public async getForecast(query: OwmForecastQuery): Promise<OwmForecast> {
        const key = `${query.lat},${query.lon}`;
        const cached = this._cache.get(key);
        if (cached) return cached;

        const fresh = await this._inner.getForecast(query);
        this._cache.set(key, fresh, ONE_DAY);
        return fresh;
    }
}
```

### `src/adapters/cache/CachedWeatherBitRepository.ts` — **2 TTL độc lập trên cùng 1 API call**

```typescript
import WeatherBitRepository from "../../domain/repositories/IWeatherBitRepository";
import { WeatherBitCurrent, WeatherBitQuery } from "../../domain/entities/WeatherBitCurrent";
import TtlCache from "./TtlCache";

export { CachedWeatherBitRepository as default };

const ONE_HOUR = 60 * 60 * 1000;
const THREE_HOURS = 3 * ONE_HOUR;

type Slot = { value: number | null; updatedAt: string };

class CachedWeatherBitRepository implements WeatherBitRepository {
    private _humidityCache = new TtlCache<Slot>();
    private _uvCache = new TtlCache<Slot>();

    constructor(private _inner: WeatherBitRepository) {}

    public async getWeatherBitCurrent(query: WeatherBitQuery): Promise<WeatherBitCurrent> {
        const key = `${query.lat},${query.lon}`;
        let humidity = this._humidityCache.get(key);
        let uv = this._uvCache.get(key);

        if (!humidity || !uv) {
            const fresh = await this._inner.getWeatherBitCurrent(query);

            if (!humidity) {
                humidity = { value: fresh.humidity, updatedAt: fresh.updatedAt };
                this._humidityCache.set(key, humidity, ONE_HOUR);
            }
            if (!uv) {
                uv = { value: fresh.uvIndex, updatedAt: fresh.updatedAt };
                this._uvCache.set(key, uv, THREE_HOURS);
            }
        }

        return {
            lat: query.lat,
            lon: query.lon,
            humidity: humidity.value,
            uvIndex: uv.value,
            updatedAt: humidity.updatedAt,
        };
    }
}
```

**Vì sao 2 cache thay vì 1:** `humidity` cần refresh mỗi 1h, `uvIndex` mỗi 3h — dù cùng 1 API call. Nếu chỉ 1 TTL, phải hy sinh 1 trong 2 cadence. Tách riêng: khi `humidity` hết hạn (mỗi giờ) mà `uv` còn hạn, vẫn phải gọi upstream (vì cần humidity mới) — nhưng **chỉ ghi đè `uvCache` khi chính nó hết hạn**, nên giá trị `uvIndex` trả về chỉ đổi mỗi 3 tiếng dù network call có thể xảy ra mỗi giờ.

---

## Bước 10 — Use-case tổng hợp: `src/domain/use-cases/buoy/GetBuoyWeatherDetailUseCase.ts`

```typescript
import BuoyWeatherRepository from "../../repositories/IBuoyWeatherRepository";
import TideRepository from "../../repositories/ITideRepository";
import WeatherBitRepository from "../../repositories/IWeatherBitRepository";
import OwmForecastRepository from "../../repositories/IOwmForecastRepository";
import { BuoyWeatherDetail, BuoyWeatherDetailQuery } from "../../entities/BuoyWeatherDetail";

export default class GetBuoyWeatherDetailUseCase {
    constructor(
        private _buoyRepo: BuoyWeatherRepository,
        private _tideRepo: TideRepository,
        private _weatherBitRepo: WeatherBitRepository,
        private _forecastRepo: OwmForecastRepository
    ) {}

    public async execute(query: BuoyWeatherDetailQuery): Promise<BuoyWeatherDetail> {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const [buoy, weatherBit, forecast, tide] = await Promise.all([
            this._buoyRepo.getBuoyWeather({ buoyId: query.buoyId }),
            this._weatherBitRepo.getWeatherBitCurrent({ lat: query.lat, lon: query.lon }),
            this._forecastRepo.getForecast({ lat: query.lat, lon: query.lon }),
            query.tideStationId
                ? this._tideRepo.getTideChart({ stationId: query.tideStationId, date: today })
                : Promise.resolve(null),
        ]);

        return {
            ...buoy,
            tideChart: tide,
            uvIndex: weatherBit.uvIndex,
            humidity: weatherBit.humidity,
            forecast,
        };
    }
}
```

`Promise.all` — 4 lệnh gọi độc lập (Mongo/NDBC, WeatherBit, OWM, NOAA tide), chạy song song giảm độ trễ. Không try/catch riêng: lỗi bất kỳ nguồn nào trồi lên Server, trả 500 qua error handler có sẵn — không nuốt lỗi.

---

## Bước 11 — Sửa `src/http/Server.ts`

**(a) Import:**
```typescript
import GetBuoyWeatherDetailUseCase from '../domain/use-cases/buoy/GetBuoyWeatherDetailUseCase';
```

**(b) `ServerUseCases.buoy` thêm:**
```typescript
buoy: {
    getBuoyWeatherDetail: GetBuoyWeatherDetailUseCase;
}
```

**(c) Route giữ nguyên vị trí, chỉ đổi tên biến use-case gọi trong controller.**

**(d) Controller — validate `lat`/`lon` bắt buộc, `tideStationId` optional:**
```typescript
private async _GET_buoyWeather (req: Request, res: Response) {
    const buoyId = req.params.buoyId as string;
    const latRaw = req.query.lat as string;
    const lonRaw = req.query.lon as string;
    const tideStationId = req.query.tideStationId as string | undefined;

    if (!buoyId) throw new ClientError("Path param 'buoyId' is required.");
    if (!latRaw || !lonRaw) throw new ClientError("Query params 'lat' and 'lon' are required.");

    const lat = parseFloat(latRaw);
    const lon = parseFloat(lonRaw);

    if (isNaN(lat) || lat < -90 || lat > 90) throw new ClientError("'lat' must be between -90 and 90.");
    if (isNaN(lon) || lon < -180 || lon > 180) throw new ClientError("'lon' must be between -180 and 180.");

    const data = await this._useCases.buoy.getBuoyWeatherDetail.execute({ buoyId, lat, lon, tideStationId });

    return res.json({ ok: true, data });
}
```

---

## Bước 12 — Sửa `src/app.ts` (wiring + connect Mongo)

```typescript
import connectMongo from './adapters/mongo/connectMongo';

import MongoBuoyWeatherRepository from './adapters/mongo/MongoBuoyWeatherRepository';
import WeatherBitCurrentRepository from './adapters/weatherbit/WeatherBitCurrentRepository';
import OwmForecastRepositoryImpl from './adapters/owm/OwmForecastRepository';

import CachedTideRepository from './adapters/cache/CachedTideRepository';
import CachedWeatherBitRepository from './adapters/cache/CachedWeatherBitRepository';
import CachedOwmForecastRepository from './adapters/cache/CachedOwmForecastRepository';

import GetBuoyWeatherDetailUseCase from './domain/use-cases/buoy/GetBuoyWeatherDetailUseCase';

const THIRTY_MINUTES = 30 * 60 * 1000;

// --- Adapter (giữ tideRepo, buoyRepo cũ đã có) ---
const mongoBuoyRepo = new MongoBuoyWeatherRepository(buoyRepo, THIRTY_MINUTES); // buoyRepo = NdbcBuoyRepository cũ, dùng khi cần refetch
const weatherBitRepo = new CachedWeatherBitRepository(new WeatherBitCurrentRepository());
const forecastRepo = new CachedOwmForecastRepository(new OwmForecastRepositoryImpl());
const cachedTideRepo = new CachedTideRepository(tideRepo); // tideRepo = NoaaTidesRepository cũ

// --- Use case tổng hợp ---
const getBuoyWeatherDetail = new GetBuoyWeatherDetailUseCase(
    mongoBuoyRepo, cachedTideRepo, weatherBitRepo, forecastRepo
);

const useCases = {
    tide: { getTideChart: new GetTideChartUseCase(tideRepo) },
    buoy: { getBuoyWeatherDetail },
};

(async () => {
    await connectMongo();
    await startServer();
})();
```

**Nhớ:** `startServer()` nằm trong cùng IIFE với `connectMongo()` — server chỉ nghe request sau khi Mongo connect xong (tránh lỗi query khi chưa kết nối). Không còn bước "start cron" nào — refresh đã nằm trong `MongoBuoyWeatherRepository` (Bước 6), tự động kích hoạt theo request thật.

---

## Bước 13 — Kiểm tra + test

```bash
npx tsc --noEmit
npm run dev
```

```bash
# 1. Cold start (buoyId mới, Mongo chưa có) — tự gọi NDBC + lưu vào Mongo
curl "http://localhost:3002/api/v1/buoys/46053/weather?lat=12.24&lon=109.19"

# 2. Gọi lại ngay — đọc thẳng từ Mongo (nhanh hơn, KHÔNG gọi NDBC vì còn trong 30 phút)
curl "http://localhost:3002/api/v1/buoys/46053/weather?lat=12.24&lon=109.19"

# 3. Có tide station
curl "http://localhost:3002/api/v1/buoys/46053/weather?lat=12.24&lon=109.19&tideStationId=9414290"

# 4. Validate lỗi
curl "http://localhost:3002/api/v1/buoys/46053/weather"                      # thiếu lat/lon -> 400
```

**Kiểm tra TTL buoy hoạt động đúng:** thêm tạm `console.log("fetch NDBC upstream")` ngay trước dòng `this._inner.getBuoyWeather(query)` trong `MongoBuoyWeatherRepository`. Gọi API 2 lần liên tiếp → chỉ thấy log 1 lần (lần đầu). Tạm hạ `THIRTY_MINUTES` xuống vài giây ở app.ts để test nhanh, đợi hết hạn, gọi lại → thấy log xuất hiện lại. Đổi về `30 * 60 * 1000` sau khi test xong. Xoá console.log tạm.

---

## Checklist tự đánh giá

- [ ] Vì sao bỏ cron mà vẫn đảm bảo refresh đúng 30 phút?
- [ ] Vì sao cách "cache-aside theo request" tiết kiệm API hơn cron chạy toàn bộ buoyId?
- [ ] Vì sao không dùng seebuoy (Python)?
- [ ] Cold-start xử lý sao khi Mongo chưa có buoyId?
- [ ] Vì sao `uvIndex`/`humidity` cần 2 `TtlCache` riêng thay vì 1?
- [ ] `forecast/hourly` và `forecast/daily` khác nhau ở domain gọi và shape response chỗ nào?
- [ ] `MongoBuoyWeatherRepository` có phải sửa `IBuoyWeatherRepository` không? Vì sao?

---

## Lỗi thường gặp

| Lỗi | Triệu chứng | Cách tránh |
|-----|-------------|-----------|
| Gọi `startServer()` trước `connectMongo()` xong | Query Mongo lỗi "not connected" ở request đầu | `await connectMongo()` trước, cùng 1 IIFE tuần tự |
| Hard-code TTL trong `MongoBuoyWeatherRepository` thay vì truyền qua constructor | Khó test, khó đổi cadence sau này | truyền `ttlMs` từ app.ts, xem Bước 6/12 |
| Gọi `forecast/hourly` bằng domain `api.openweathermap.org` thay vì `pro.openweathermap.org` | HTTP 401 dù key đúng | dùng đúng domain `pro.openweathermap.org` cho hourly |
| Quên `cnt=5` ở `forecast/daily` | Trả về 16 ngày thay vì 5 | thêm `&cnt=5` vào query |
| Quên `.lean()` khi query Mongo chỉ để đọc | Trả về Mongoose Document dư thừa, chậm hơn | thêm `.lean()` khi không cần `.save()` |
| WeatherBit dùng chung 1 `TtlCache` cho uv+humidity | 1 trong 2 field sai cadence | 2 cache riêng, xem Bước 9 |
