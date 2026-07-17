# Hướng dẫn tự code: Feature "Weather tại Buoy" (NDBC)

Mục tiêu: thêm endpoint `GET /api/v1/buoys/:buoyId/weather` trả thời tiết thực đo tại 1 trạm phao NDBC.

> Bạn tự gõ theo thứ tự dưới. Mỗi bước giải thích **làm gì / tại sao**. Code là để bạn hiểu và gõ lại, đừng copy mù.

---

## Bối cảnh: NDBC khác NOAA Tides ở đâu?

- NOAA Tides trả **JSON** → dễ.
- NDBC trả **file text cột cố định** (không JSON) → phải tự tách chuỗi (parse).
- URL: `https://www.ndbc.noaa.gov/data/realtime2/{STATION}.txt`

Ví dụ nội dung file:
```
#YY  MM DD hh mm WDIR WSPD GST  WVHT DPD  APD MWD  PRES  ATMP WTMP DEWP VIS PTDY TIDE
#yr  mo dy hr mn degT m/s  m/s   m   sec  sec degT hPa   degC degC degC nmi hPa   ft
2026 07 17 04 10 230  7.0  8.0   MM  MM   MM  MM  1009.0 18.7 19.7 15.0 MM  MM    MM
```
- 2 dòng đầu `#` = header (bỏ).
- Dòng data đầu tiên = **mới nhất**.
- `MM` = không đo được → phải map thành `null`, KHÔNG phải 0.

---

## Thứ tự làm (từ trong ra ngoài — đúng Clean Architecture)

Luôn code theo hướng: **entity → repository (interface) → adapter (impl) → use-case → HTTP → wiring**. Lý do: tầng trong không phụ thuộc tầng ngoài, nên làm trong trước.

1. Entity — định nghĩa dữ liệu
2. Repository interface — hợp đồng
3. Adapter — hiện thực (gọi + parse NDBC)
4. Use-case — nghiệp vụ
5. Server — route + controller
6. app.ts — nối dây (wiring)
7. Test

---

## Bước 1 — Entity: `src/domain/entities/BuoyWeather.ts`

**Làm gì:** khai báo hình dạng dữ liệu trả ra (SI, có thể null). **Tại sao trước tiên:** mọi tầng khác phụ thuộc kiểu này.

```typescript
export type BuoyQuery = {
    buoyId: string; // NDBC station ID, vd "46053"
};

export interface BuoyWeather {
    buoyId: string;

    windDirection:      number | null; // độ (0-360)
    windSpeed:          number | null; // m/s
    gust:               number | null; // m/s
    waveHeight:         number | null; // m
    atmospherePressure: number | null; // hPa
    temperature:        number | null; // °C (không khí)
    waterTemp:          number | null; // °C (nước biển)
    visibility:         number | null; // m

    updatedAt: string; // ISO 8601 UTC — thời điểm NDBC đo
}
```

**Điểm quan trọng:** mọi field số đều `number | null`. Trạm ven bờ không đo sóng → `waveHeight = null`. Client phải chịu được null.

---

## Bước 2 — Repository interface: `src/domain/repositories/BuoyWeatherRepository.ts`

**Làm gì:** khai báo "có thể làm gì" (lấy weather theo buoyId), không nói "làm sao". **Tại sao:** để use-case chỉ phụ thuộc interface, đổi nguồn không đụng nghiệp vụ.

```typescript
import { BuoyWeather, BuoyQuery } from "../entities/BuoyWeather";

export default interface BuoyWeatherRepository {
    getBuoyWeather(query: BuoyQuery): Promise<BuoyWeather>;
}
```

> Dùng `export default interface` giống `TideRepository.ts` cho nhất quán.

---

## Bước 3 — Adapter: `src/adapters/ndbc/NdbcBuoyRepository.ts`

**Làm gì:** hiện thực interface — tải file text NDBC + parse thành `BuoyWeather`. **Đây là chỗ DUY NHẤT biết NDBC.**

```typescript
import BuoyWeatherRepository from "../../domain/repositories/BuoyWeatherRepository";
import { BuoyWeather, BuoyQuery } from "../../domain/entities/BuoyWeather";

export { NdbcBuoyRepository as default };

/* -------------------------------------------------------------------------- */

const NDBC_BASE = "https://www.ndbc.noaa.gov/data/realtime2";

// Vị trí (index) cột sau khi tách dòng theo khoảng trắng.
const COL = {
    year: 0, month: 1, day: 2, hour: 3, min: 4,
    wdir: 5,  // wind direction (deg)
    wspd: 6,  // wind speed (m/s)
    gst:  7,  // gust (m/s)
    wvht: 8,  // wave height (m)
    pres: 12, // pressure (hPa)
    atmp: 13, // air temp (°C)
    wtmp: 14, // water temp (°C)
    vis:  16, // visibility (hải lý / nmi)
};

/* -------------------------------------------------------------------------- */

class NdbcBuoyRepository implements BuoyWeatherRepository {

    public async getBuoyWeather(query: BuoyQuery): Promise<BuoyWeather> {
        const text = await this._fetchText(query.buoyId);
        return this._parse(query.buoyId, text);
    }

    // Tải file text realtime2.
    private async _fetchText(buoyId: string): Promise<string> {
        const resp = await fetch(`${NDBC_BASE}/${buoyId}.txt`);
        if (!resp.ok) {
            throw new Error(`NDBC request failed: HTTP ${resp.status}`);
        }
        return resp.text();
    }

    // Parse text -> BuoyWeather. Lấy dòng data đầu tiên (mới nhất).
    private _parse(buoyId: string, text: string): BuoyWeather {
        const lines = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith("#"));

        if (lines.length === 0) {
            throw new Error(`NDBC station ${buoyId} has no data.`);
        }

        const cols = lines[0]!.split(/\s+/);
        const visNmi = this._num(cols[COL.vis]);

        return {
            buoyId,
            windDirection:      this._num(cols[COL.wdir]),
            windSpeed:          this._num(cols[COL.wspd]),
            gust:               this._num(cols[COL.gst]),
            waveHeight:         this._num(cols[COL.wvht]),
            atmospherePressure: this._num(cols[COL.pres]),
            temperature:        this._num(cols[COL.atmp]),
            waterTemp:          this._num(cols[COL.wtmp]),
            visibility:         visNmi === null ? null : visNmi * 1852, // nmi -> m
            updatedAt:          this._toIso(cols),
        };
    }

    // "MM" hoặc thiếu = không đo được -> null.
    private _num(token: string | undefined): number | null {
        if (token === undefined || token === "MM") return null;
        const n = parseFloat(token);
        return isNaN(n) ? null : n;
    }

    // Ghép 5 cột thời gian UTC -> ISO "2026-07-17T04:10:00Z".
    private _toIso(cols: string[]): string {
        const yyyy = cols[COL.year];
        const mm   = cols[COL.month];
        const dd   = cols[COL.day];
        const hh   = cols[COL.hour];
        const min  = cols[COL.min];
        return `${yyyy}-${mm}-${dd}T${hh}:${min}:00Z`;
    }
}
```

**Cần hiểu:**
- `split(/\s+/)` tách theo 1+ khoảng trắng (file căn cột nên số khoảng trắng khác nhau).
- `lines[0]!` — dấu `!` bảo TS "chắc chắn không undefined" (vì đã check `length === 0`). Cần vì bật `noUncheckedIndexedAccess`.
- **Convert đơn vị ngay tại adapter:** `visibility` hải lý → ×1852 = mét. Nguyên tắc: đổi về SI ở chỗ duy nhất biết đơn vị nguồn.

---

## Bước 4 — Use-case: `src/domain/use-cases/buoy/GetBuoyWeatherUseCase.ts`

**Làm gì:** 1 nghiệp vụ, nhận repository qua constructor, gọi `.execute()`.

```typescript
import BuoyWeatherRepository from "../../repositories/BuoyWeatherRepository";
import { BuoyWeather, BuoyQuery } from "../../entities/BuoyWeather";

export default class GetBuoyWeatherUseCase {
    constructor(private _buoyRepo: BuoyWeatherRepository) {}

    public execute(query: BuoyQuery): Promise<BuoyWeather> {
        return this._buoyRepo.getBuoyWeather(query);
    }
}
```

> `export default class` — vì Server/app import kiểu default. **Nhớ:** default export ↔ default import phải khớp.

---

## Bước 5 — Sửa `src/http/Server.ts`

Thêm 4 chỗ:

**(a) Import (đầu file):**
```typescript
import GetBuoyWeatherUseCase from '../domain/use-cases/buoy/GetBuoyWeatherUseCase';
```

**(b) Thêm vào type `ServerUseCases`:**
```typescript
type ServerUseCases = {
    tide: {
        getTideChart: GetTideChartUseCase;
    }
    buoy: {
        getBuoyWeather: GetBuoyWeatherUseCase;
    }
}
```

**(c) Thêm route vào mảng `routes`:**
```typescript
['GET', '/api/v1/buoys/:buoyId/weather',
    this._GET_buoyWeather.bind(this)
],
```

**(d) Thêm controller (đặt cạnh `_GET_tides`):**
```typescript
private async _GET_buoyWeather (req: Request, res: Response) {
    const buoyId = req.params.buoyId as string;

    if (!buoyId) throw new ClientError("Path param 'buoyId' is required.");

    const data = await this._useCases.buoy.getBuoyWeather.execute({ buoyId });

    return res.json({ ok: true, data });
}
```

**Nhớ:** gọi `.getBuoyWeather.execute(...)` — `getBuoyWeather` là instance use-case, phải `.execute()`. (Đây chính là lỗi hay quên.)

---

## Bước 6 — Sửa `src/app.ts` (wiring / composition root)

```typescript
// thêm import:
import NdbcBuoyRepository from './adapters/ndbc/NdbcBuoyRepository';
import GetBuoyWeatherUseCase from './domain/use-cases/buoy/GetBuoyWeatherUseCase';

// thêm adapter:
const buoyRepo = new NdbcBuoyRepository()

// thêm vào useCases:
const useCases = {
    tide: {
        getTideChart: new GetTideChartUseCase(tideRepo)
    },
    buoy: {
        getBuoyWeather: new GetBuoyWeatherUseCase(buoyRepo)
    }
};
```

---

## Bước 7 — Kiểm tra + test

```bash
# 1. Type-check trước (bắt lỗi sớm)
npx tsc --noEmit

# 2. Chạy
npm run dev

# 3. Test (46053 = ngoài khơi California)
curl "http://localhost:3002/api/v1/buoys/46053/weather"
```

Kết quả mong đợi:
```json
{"ok":true,"data":{
  "buoyId":"46053","windDirection":230,"windSpeed":7,"gust":8,
  "waveHeight":null,"atmospherePressure":1009,
  "temperature":18.7,"waterTemp":19.7,"visibility":null,
  "updatedAt":"2026-07-17T04:10:00Z"}}
```

Test lỗi (không có buoyId thì Express không match route → 404 "Not Found" — bình thường).

---

## Checklist tự đánh giá (hiểu hay chưa)

- [ ] Vì sao adapter phải parse text, còn NOAA thì không?
- [ ] `MM` map thành gì? Tại sao không phải 0?
- [ ] Vì sao convert hải lý→mét đặt ở adapter, không ở controller?
- [ ] `export default` vs `export {X as default}` khác gì? Import tương ứng ra sao?
- [ ] Vì sao gọi `.getBuoyWeather.execute()` chứ không `.getBuoyWeather()`?
- [ ] Thứ tự code entity→repo→adapter→usecase→http, vì sao không ngược lại?

Trả lời được hết = nắm chắc pattern. Feature sau (Weather điểm bất kỳ, Alert) làm y hệt khung này.

---

## Lỗi thường gặp (đã dính ở Tide)

| Lỗi | Triệu chứng | Cách tránh |
|-----|-------------|-----------|
| default vs named export lệch | import ra `undefined`, `new` crash | export sao, import vậy |
| quên `async` khi có `await` | lỗi biên dịch | có `await` thì method phải `async` |
| gọi use-case thiếu `.execute()` | "not callable" | luôn `.execute(...)` |
| thiếu `;` trước `(async()=>{})()` | "expression not callable" (ASI) | thêm `;` sau object đứng trước `(` |

**Thói quen tốt:** chạy `npx tsc --noEmit` sau mỗi bước, sửa lỗi ngay.
