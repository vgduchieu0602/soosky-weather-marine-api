# Hướng dẫn tự code: Feature "Weather tại điểm bất kỳ" (OWM + WeatherBit fallback)

Mục tiêu: thêm endpoint `GET /api/v1/weather?lat=..&lon=..` trả thời tiết hiện tại tại 1 toạ độ.
Nguồn chính: **OpenWeatherMap (OWM)**. Nếu OWM lỗi (down, hết quota, timeout) → tự động fallback sang **WeatherBit**.

> Tự gõ theo thứ tự. Đừng copy mù — mỗi bước có "làm gì / tại sao".

---

## Bối cảnh: vì sao cần fallback?

Buoy feature chỉ 1 nguồn (NDBC) → 1 adapter, xong.
Feature này có **2 nguồn cùng vai trò** ("cho tôi weather tại toạ độ này"), nên dùng pattern:

**Composite Repository** — 1 class cũng implement `WeatherRepository`, bên trong gọi OWM trước, lỗi thì gọi WeatherBit. Use-case và Server **không biết** có 2 nguồn — chỉ thấy 1 `WeatherRepository`. Đây là lý do dùng interface: đổi/thêm nguồn không đụng tầng trên.

```
GetPointWeatherUseCase
        │  (chỉ biết interface)
        ▼
WeatherRepository (interface)
        ▲
        │ implements
FallbackWeatherRepository   ← đây là "adapter" duy nhất use-case thấy
   ├── OwmWeatherRepository       (thử trước)
   └── WeatherBitWeatherRepository (dự phòng)
```

---

## API 2 nguồn (tham khảo, tự test bằng curl/Postman trước khi code)

**OWM — Current Weather:**
```
GET https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OWM_API_KEY}&units=metric
```
Field cần lấy: `main.temp` (°C), `main.pressure` (hPa), `main.humidity` (%), `wind.speed` (m/s), `wind.deg` (độ), `visibility` (m, đã là SI), `weather[0].description`, `dt` (unix seconds UTC).

**WeatherBit — Current:**
```
GET https://api.weatherbit.io/v2.0/current?lat={lat}&lon={lon}&key={WEATHERBIT_API_KEY}
```
Response có mảng `data[0]`: `temp` (°C), `pres` (hPa), `rh` (%), `wind_spd` (m/s), `wind_dir` (độ), `vis` (km → phải ×1000 ra mét), `weather.description`, `ts` (unix seconds UTC).

**Điểm khác biệt cần map cho khớp:** WeatherBit trả `vis` bằng **km**, OWM trả `visibility` bằng **mét**. Chuẩn hoá về mét (SI) ngay tại từng adapter — giống bài học `visibility` hải lý→mét ở Buoy.

---

## Thứ tự làm

1. Entity — `src/domain/entities/PointWeather.ts`
2. Repository interface — `src/domain/repositories/IWeatherRepository.ts`
3. Adapter OWM — `src/adapters/owm/OwmWeatherRepository.ts`
4. Adapter WeatherBit — `src/adapters/weatherbit/WeatherBitWeatherRepository.ts`
5. Adapter Fallback (composite) — `src/adapters/weather/FallbackWeatherRepository.ts`
6. Use-case — `src/domain/use-cases/weather/GetPointWeatherUseCase.ts`
7. Server — route + controller
8. app.ts — wiring
9. Test

---

## Bước 1 — Entity: `src/domain/entities/PointWeather.ts`

```typescript
export type PointWeatherQuery = {
    lat: number;
    lon: number;
};

export interface PointWeather {
    lat: number;
    lon: number;

    temperature: number | null;       // °C
    pressure:    number | null;       // hPa
    humidity:    number | null;       // %
    windSpeed:   number | null;       // m/s
    windDirection: number | null;     // độ (0-360)
    visibility:  number | null;       // m
    description: string | null;

    source: 'owm' | 'weatherbit';     // biết data lấy từ đâu — hữu ích để debug fallback
    updatedAt: string;                // ISO 8601 UTC
}
```

**Vì sao có field `source`:** khi fallback kích hoạt, client/log cần biết đang xài data phụ để không ngạc nhiên nếu số liệu hơi khác.

---

## Bước 2 — Repository interface: `src/domain/repositories/IWeatherRepository.ts`

```typescript
import { PointWeather, PointWeatherQuery } from "../entities/PointWeather";

export default interface WeatherRepository {
    getWeather(query: PointWeatherQuery): Promise<PointWeather>;
}
```

---

## Bước 3 — Adapter OWM: `src/adapters/owm/OwmWeatherRepository.ts`

**Làm gì:** gọi OWM, map response → `PointWeather`. Nhớ đọc `config.owm.apiKey`, không hard-code key.

```typescript
import config from "../../config";
import WeatherRepository from "../../domain/repositories/IWeatherRepository";
import { PointWeather, PointWeatherQuery } from "../../domain/entities/PointWeather";

export { OwmWeatherRepository as default };

const OWM_BASE = "https://api.openweathermap.org/data/2.5/weather";

class OwmWeatherRepository implements WeatherRepository {
    public async getWeather(query: PointWeatherQuery): Promise<PointWeather> {
        const url = `${OWM_BASE}?lat=${query.lat}&lon=${query.lon}&appid=${config.owm.apiKey}&units=metric`;
        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`OWM request failed: HTTP ${resp.status}`);
        }

        const json: any = await resp.json();

        return {
            lat: query.lat,
            lon: query.lon,
            temperature:   json.main?.temp ?? null,
            pressure:      json.main?.pressure ?? null,
            humidity:      json.main?.humidity ?? null,
            windSpeed:     json.wind?.speed ?? null,
            windDirection: json.wind?.deg ?? null,
            visibility:    json.visibility ?? null, // đã là mét
            description:   json.weather?.[0]?.description ?? null,
            source: 'owm',
            updatedAt: new Date(json.dt * 1000).toISOString(),
        };
    }
}
```

**Cần hiểu:** `json.dt` là unix **seconds**, `Date` cần **milliseconds** → nhân 1000.

---

## Bước 4 — Adapter WeatherBit: `src/adapters/weatherbit/WeatherBitWeatherRepository.ts`

```typescript
import config from "../../config";
import WeatherRepository from "../../domain/repositories/IWeatherRepository";
import { PointWeather, PointWeatherQuery } from "../../domain/entities/PointWeather";

export { WeatherBitWeatherRepository as default };

const WEATHERBIT_BASE = "https://api.weatherbit.io/v2.0/current";

class WeatherBitWeatherRepository implements WeatherRepository {
    public async getWeather(query: PointWeatherQuery): Promise<PointWeather> {
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
            temperature:   d.temp ?? null,
            pressure:      d.pres ?? null,
            humidity:      d.rh ?? null,
            windSpeed:     d.wind_spd ?? null,
            windDirection: d.wind_dir ?? null,
            visibility:    d.vis != null ? d.vis * 1000 : null, // km -> m
            description:   d.weather?.description ?? null,
            source: 'weatherbit',
            updatedAt: new Date(d.ts * 1000).toISOString(),
        };
    }
}
```

---

## Bước 5 — Adapter Fallback: `src/adapters/weather/FallbackWeatherRepository.ts`

**Làm gì:** nhận 2 repo qua constructor (dependency injection), thử `primary` trước, lỗi thì `catch` và gọi `secondary`. **Đây là adapter duy nhất use-case/Server biết tới.**

```typescript
import WeatherRepository from "../../domain/repositories/IWeatherRepository";
import { PointWeather, PointWeatherQuery } from "../../domain/entities/PointWeather";

export { FallbackWeatherRepository as default };

class FallbackWeatherRepository implements WeatherRepository {
    constructor(
        private _primary: WeatherRepository,
        private _secondary: WeatherRepository
    ) {}

    public async getWeather(query: PointWeatherQuery): Promise<PointWeather> {
        try {
            return await this._primary.getWeather(query);
        } catch (err) {
            console.error("Primary weather source failed, falling back:", (err as Error).message);
            return await this._secondary.getWeather(query);
        }
    }
}
```

**Vì sao không try/catch trong use-case:** use-case là nghiệp vụ ("lấy weather"), không phải chỗ quyết định nguồn nào backup nguồn nào — đó là chi tiết hạ tầng, thuộc về adapter.

**Nếu cả 2 đều lỗi:** `_secondary.getWeather` throw tiếp, lỗi tự trồi lên Server → error handler trả 500. Không cần bắt thêm ở đây (tránh nuốt lỗi).

---

## Bước 6 — Use-case: `src/domain/use-cases/weather/GetPointWeatherUseCase.ts`

```typescript
import WeatherRepository from "../../repositories/IWeatherRepository";
import { PointWeather, PointWeatherQuery } from "../../entities/PointWeather";

export default class GetPointWeatherUseCase {
    constructor(private _weatherRepo: WeatherRepository) {}

    public execute(query: PointWeatherQuery): Promise<PointWeather> {
        return this._weatherRepo.getWeather(query);
    }
}
```

---

## Bước 7 — Sửa `src/http/Server.ts`

**(a) Import:**
```typescript
import GetPointWeatherUseCase from '../domain/use-cases/weather/GetPointWeatherUseCase';
```

**(b) Thêm vào `ServerUseCases`:**
```typescript
weather: {
    getPointWeather: GetPointWeatherUseCase;
}
```

**(c) Thêm route:**
```typescript
['GET', '/api/v1/weather',
    this._GET_pointWeather.bind(this)
],
```

**(d) Controller — parse + validate `lat`/`lon` (query string luôn là string, phải tự parseFloat + validate range):**
```typescript
private async _GET_pointWeather (req: Request, res: Response) {
    const latRaw = req.query.lat as string;
    const lonRaw = req.query.lon as string;

    if (!latRaw || !lonRaw) throw new ClientError("Query params 'lat' and 'lon' are required.");

    const lat = parseFloat(latRaw);
    const lon = parseFloat(lonRaw);

    if (isNaN(lat) || lat < -90 || lat > 90) throw new ClientError("'lat' must be a number between -90 and 90.");
    if (isNaN(lon) || lon < -180 || lon > 180) throw new ClientError("'lon' must be a number between -180 and 180.");

    const data = await this._useCases.weather.getPointWeather.execute({ lat, lon });

    return res.json({ ok: true, data });
}
```

**Vì sao validate range:** tránh gọi OWM/WeatherBit với toạ độ vô nghĩa (tốn quota, lỗi khó hiểu từ upstream).

---

## Bước 8 — Sửa `src/app.ts` (wiring)

```typescript
// import
import OwmWeatherRepository from './adapters/owm/OwmWeatherRepository';
import WeatherBitWeatherRepository from './adapters/weatherbit/WeatherBitWeatherRepository';
import FallbackWeatherRepository from './adapters/weather/FallbackWeatherRepository';
import GetPointWeatherUseCase from './domain/use-cases/weather/GetPointWeatherUseCase';

// adapters
const owmRepo = new OwmWeatherRepository();
const weatherBitRepo = new WeatherBitWeatherRepository();
const weatherRepo = new FallbackWeatherRepository(owmRepo, weatherBitRepo); // OWM = primary, WeatherBit = secondary

// useCases
const useCases = {
    tide: { getTideChart: new GetTideChartUseCase(tideRepo) },
    buoy: { getBuoyWeather: new GetBuoyWeatherUseCase(buoyRepo) },
    weather: { getPointWeather: new GetPointWeatherUseCase(weatherRepo) }
};
```

**Đây chính là chỗ "chọn thứ tự fallback"** — muốn đổi WeatherBit làm primary thì chỉ đảo 2 tham số ở dòng `new FallbackWeatherRepository(...)`, không đụng code nào khác. Đó là lợi ích của pattern này.

---

## Bước 9 — Kiểm tra + test

```bash
npx tsc --noEmit
npm run dev

# Toạ độ Nha Trang ví dụ
curl "http://localhost:3002/api/v1/weather?lat=12.24&lon=109.19"
```

Kết quả mong đợi (giá trị thật sẽ khác):
```json
{"ok":true,"data":{
  "lat":12.24,"lon":109.19,
  "temperature":29.5,"pressure":1008,"humidity":78,
  "windSpeed":3.6,"windDirection":110,"visibility":10000,
  "description":"scattered clouds","source":"owm",
  "updatedAt":"2026-07-17T05:00:00Z"}}
```

**Test fallback thật sự hoạt động:** tạm sửa `config.owm.apiKey` (trong `.env`) thành giá trị sai, gọi lại → OWM trả 401/lỗi, log console in ra dòng "Primary weather source failed, falling back:", response vẫn `ok:true` nhưng `"source":"weatherbit"`. Sửa lại key đúng sau khi test xong.

---

## Checklist tự đánh giá

- [ ] Vì sao dùng 1 class `FallbackWeatherRepository` thay vì if/else trong use-case?
- [ ] Vì sao try/catch fallback nằm ở adapter, không ở Server/controller?
- [ ] OWM `visibility` đơn vị gì, WeatherBit `vis` đơn vị gì — chỗ nào convert?
- [ ] `dt`/`ts` unix seconds → Date cần nhân mấy?
- [ ] Muốn đổi thứ tự primary/secondary thì sửa đúng 1 chỗ nào?
- [ ] Field `source` dùng để làm gì?

---

## Lỗi thường gặp

| Lỗi | Triệu chứng | Cách tránh |
|-----|-------------|-----------|
| Quên `units=metric` (OWM) | Nhiệt độ ra ~300 (Kelvin) | luôn thêm `&units=metric` |
| Quên đổi WeatherBit `vis` km→m | `visibility` sai 1000 lần so với OWM | nhân `1000` ngay tại adapter |
| `catch` nuốt lỗi cả 2 nguồn | Client nhận response rỗng/undefined thay vì lỗi rõ ràng | không catch bọc quanh `_secondary.getWeather` |
| Validate lat/lon thiếu | Gọi upstream với NaN → lỗi 500 khó hiểu | check `isNaN` + range trước khi gọi use-case |
