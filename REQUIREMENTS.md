# REQUIREMENTS — Soosky Weather Marine API

## 1. Mục tiêu và phạm vi

### 1.1 Mục tiêu

   Hệ thống là một backend HTTP read-only cung cấp dữ liệu thời tiết biển tổng hợp theo toạ độ hoặc theo trạm phao, cộng một worker nền đồng bộ danh mục trạm phao NDBC vào MongoDB dùng chung.

### 1.2 Trong phạm vi

- 9 HTTP endpoint phục vụ một frontend nội bộ.
- Đồng bộ định kỳ danh mục trạm phao NDBC vào collection `buoys`.
- Tầng cache bền vững (MongoDB) + cache RAM cho từng nguồn dữ liệu.
- Sinh lời khuyên an toàn hàng hải bằng Gemini theo persona.
- Chạy 2 process Node (API + worker) và deploy tự động lên một VPS.

### 1.3 Ngoài phạm vi

   Không có xác thực, phân quyền, quản lý người dùng, ghi dữ liệu do client gửi lên, phân trang, hay bất kỳ endpoint mutate nghiệp vụ nào.

## 2. Functional Requirements

### 2.1 Bề mặt HTTP

**FR-001 — Health check:**
`GET /health` trả `{ ok: true, data: { uptime }, meta }`. Không rate-limit riêng,
không xác thực.

**FR-002 — Biểu đồ thuỷ triều:** 
`GET /api/v1/tides?stationId=<7 chữ số>&days=<1..7>` trả `TideChart`
(`stationId`, `predictions[]` theo giờ, `highLow[]` với type `H`/`L`).
Ngày luôn là **hôm nay theo UTC**, backend tự đặt, client không truyền được.

**FR-003 — Danh sách trạm phao:**
`GET /api/v1/buoys` trả `BuoyStation[]` (`buoyId`, `name`, `lat`, `lon`) đọc từ
collection `buoys`. DB rỗng → fallback fetch NDBC trực tiếp và seed nền
(best-effort, không chặn response). Nguồn fallback lỗi → trả mảng rỗng.

**FR-004 — Thời tiết tại trạm phao:**
`GET /api/v1/buoys/:buoyId/weather?lat=&lon=[&tideStationId=]` trả `WeatherDetail`.
Số đo lấy từ NDBC theo `buoyId`; tình trạng thời tiết (`conditionCode`, `icon`,
`description`) lấy từ OWM current theo `lat`/`lon`; `uvIndex`/`humidity`/`dewPoint`
từ WeatherBit; `forecast` từ OWM; `tideChart` theo FR-011.

**FR-005 — Thời tiết tại toạ độ bất kỳ:**
`GET /api/v1/weather?lat=&lon=[&tideStationId=]` trả cùng shape `WeatherDetail`.
`buoyId`/`buoyName` luôn `null`; `waveHeight`/`waterTemp` được bù từ phao gần nhất

**FR-006 — Map tile:**
`GET /api/v1/maps/:layer/:z/:x/:y` trả **ảnh PNG nhị phân** (không bọc envelope
JSON), với `Content-Type` lấy từ upstream. `layer ∈ {windSpeed, temperature, pressure}`
ánh xạ sang `wind_new` / `temp_new` / `pressure_new` của OWM Weather Maps 1.0.

**FR-007 — Radar:**
`GET /api/v1/radar?lat=&lon=` trả `{ host, past[], nowcast[], generatedAt, lat, lon }`.
Frame RainViewer là **toàn cầu**; `lat`/`lon` chỉ được echo lại cho FE căn vị trí.

**FR-008 — Cảnh báo thời tiết:**
`GET /api/v1/alerts?lat=&lon=` trả `{ lat, lon, alerts[], updatedAt }`; mỗi alert
gồm `title`, `severity`, `regions[]`, `onsetLocal`, `endsLocal`. Mảng rỗng nghĩa là
không có cảnh báo.

**FR-009 — Smart Weather Tips:**
`POST /api/v1/weather-tips` body `{ persona, weather }` trả `{ persona, tips[] }`.
Dùng POST vì `weather` là object lớn, không hợp query string. **Không cache** —
mỗi request persona/weather khác nhau.

### 2.2 Contract response

**FR-010 — Envelope thống nhất:**
Thành công: `{ ok: true, data, meta }`. Lỗi: `{ ok: false, code, reason, meta }`.
Ngoại lệ duy nhất là FR-006 (ảnh nhị phân).

**FR-011 — Chuẩn hoá `data`:**
Trước khi trả về: `number` → `string`; `null`/`undefined`/`NaN` → `"n/a"`;
`string`/`boolean` giữ nguyên; `object`/`array` đệ quy. Áp ở tầng HTTP, domain vẫn
giữ `number | null` thật.

**FR-012 — Shape bất biến giữa 2 endpoint weather:**
`BuoyWeatherDetail` và `PointWeatherDetail` đều là **type alias** của
`WeatherDetail` (không copy field), nên hai endpoint không thể lệch shape. Thứ tự
key trong hai use-case được yêu cầu giữ giống nhau. Key thiếu hẳn sẽ **không** thành
`"n/a"` mà biến mất khỏi JSON — bị cấm rõ ràng trong comment.

**FR-013 — `meta` khai báo nguồn dữ liệu:**
Mọi response JSON kèm `meta = { requestReceivedAt, responseSentAt, processingMs, dataSources[] }`.
Mỗi phần tử `dataSources` có `{ source, status, dataFetchedAt }` với
`status ∈ {upstream, cache, stale-cache, unavailable}`. Trace lưu theo request bằng
`AsyncLocalStorage`.

**FR-014 — Ánh xạ lỗi HTTP:**

| Nguyên nhân | HTTP | `code` |
|---|---|---|
| `ClientError` (validate input) | 400 (mặc định) | `BAD_REQUEST` |
| Vượt rate limit | 429 | `RATE_LIMITED` |
| Route không tồn tại | 404 | `NOT_FOUND` |
| `StationNotFoundError` | 404 | `STATION_NOT_FOUND` |
| `NoTideDataError` | 422 | `NO_TIDE_DATA` |
| `UpstreamUnavailableError` | 502 | `UPSTREAM_UNAVAILABLE` |
| Map tile bị tắt | 503 | `MAP_TILES_DISABLED` |
| Còn lại | 500 | `INTERNAL` |

### 2.3 Hợp nhất và làm giàu dữ liệu

**FR-015 — Auto-resolve trạm thuỷ triều:**
Nếu client truyền `tideStationId` thì dùng đúng trạm đó. Nếu không: lấy tối đa 3
trạm NOAA gần nhất trong bán kính 150 km, thử **lần lượt**, lấy trạm đầu tiên có
prediction. Không trạm nào có data → `tideChart = null` nhưng vẫn trả
`tideStationId` của trạm gần nhất đã thử.

**FR-016 — Auto-resolve phao bù sóng/nhiệt độ nước:**
Với `GET /api/v1/weather`: lấy tối đa 3 phao NDBC gần nhất trong 200 km, thử lần
lượt, **ưu tiên phao có `waveHeight` thật**; nếu không có, dùng phao fetch thành
công đầu tiên (ít nhất lấy `waterTemp`). `buoyStationId` báo phao thực sự cung cấp
số đo.

**FR-017 — Chuỗi fallback nhiệt độ:**

- Endpoint buoy: `NDBC → WeatherBit → OWM`
- Endpoint point: `WeatherBit → OWM`

Response luôn kèm `temperatureSource` cho biết nguồn đã dùng (`null` nếu không nguồn nào có).

**FR-018 — Suy giảm từng phần, không sập response:**
Mỗi nguồn upstream trong hai use-case weather được bọc `resilientSource`: lỗi →
`null` + log `[source-down]`, response vẫn 200 với dữ liệu một phần. Kèm **negative
cache 2 phút** theo key: nguồn vừa lỗi thì request kế tiếp trong cửa sổ đó trả
`null` ngay, không gọi lại upstream.

**FR-019 — Radar và Alert suy giảm về rỗng:**
Upstream lỗi **và** không có cache → trả 200 với `alerts: []` / `past: [], nowcast: []`
thay vì 5xx.

### 2.4 Cache

**FR-020 — Cache-aside bền vững trên MongoDB:**
Mỗi nguồn có một cache store Mongo thuần (read/write) + một decorator repository
ghép TTL/refetch. Cache dùng chung giữa mọi user và mọi instance, sống sót restart.
TTL cấu hình cứng trong composition root:

| Nguồn | TTL | Lý do ghi trong code |
|---|---|---|
| NDBC buoy | 30 phút | data đo thực tế, đổi liên tục |
| OWM current | 30 phút | như trên |
| WeatherBit humidity | 3 giờ | cadence nguồn |
| WeatherBit uvIndex | 3 giờ | cadence nguồn, TTL riêng |
| OWM forecast | 1 ngày | prediction của 1 ngày cụ thể không đổi trong ngày |
| NOAA tide | 1 ngày | như trên |
| RainViewer radar | 10 phút | — |
| WeatherBit alerts | 30 phút (3 phút nếu rỗng) | cảnh báo mới có thể ban hành ngay sau khi nhận `[]` |
| OWM map tile | 15 phút, RAM, LRU cap 500 entry | ảnh nặng, không cần bền vững |

**FR-021 — Phục vụ bản stale khi refetch lỗi:**
Cache hết hạn + refetch lỗi + vẫn còn bản cũ → trả bản cũ, log cảnh báo, đánh dấu
`status: 'stale-cache'` trong `meta`. Chỉ ném lỗi khi hoàn toàn không có cache.

**FR-022 — TTL đo từ mốc ghi cache, không từ mốc quan trắc:**
WeatherBit trả `ob_time` trễ 15–60 phút. Nếu đo TTL bằng `ob_time` thì cache hết
hạn ngay khi vừa ghi. Vì vậy schema tách `humidityCachedAt` / `uvCachedAt` (mốc ghi
cache, dùng so TTL) khỏi `humidityUpdatedAt` / `uvUpdatedAt` (mốc đo, trả client).

**FR-023 — Ghi cache từng phần cho WeatherBit:**
`humidity`/`dewPoint`/`temperature` và `uvIndex` có TTL riêng; chỉ field hết hạn
mới được ghi đè, field còn tươi giữ nguyên.

**FR-024 — Forecast hết hạn khi sang ngày UTC mới:**
Dù TTL 24 giờ chưa hết, cache forecast bị coi là hết hạn khi ngày UTC đổi, tránh
mảng `daily` lệch 1 ngày.

**FR-025 — Document forecast thiếu timezone là cache miss:**
Đọc cache forecast mà document không có `timezoneOffsetSeconds` → coi là cache miss.

### 2.5 Worker đồng bộ trạm phao

**FR-026 — Đồng bộ định kỳ:**
Worker `dist/buoy-sync.js` chạy `SyncBuoyStationsUseCase` mỗi `SYNC_INTERVAL_MS`
(mặc định 24 giờ), tuỳ chọn chạy ngay lúc boot (`SYNC_RUN_ON_BOOT`, mặc định bật).

**FR-027 — Bảo vệ dữ liệu khi feed rỗng:**
Feed trả 0 trạm → use-case throw `Source returned 0 stations`, **không ghi gì**.


**FR-028 — Upsert có phát hiện thay đổi + thống kê:**

- Trạm mới: đặt `name`, `lat`, `lon`, `source`, `firstSeenAt`, `lastSeenAt`, `changedAt`.
- Trạm đổi `name`/`lat`/`lon`: cập nhật giá trị + `lastSeenAt` + `changedAt`.
- Trạm không đổi: **chỉ** cập nhật `lastSeenAt`.

Trả `SyncStats { total, created, changed, unchanged }`, worker log một dòng
`Buoy sync complete: total=... created=... changed=... unchanged=...`.

**FR-029 — Chống chạy chồng và chịu lỗi:**
Scheduler bỏ qua tick mới khi tick trước còn đang chạy; task lỗi chỉ log
`Scheduled task failed.` và vòng sau vẫn chạy; `stop()` clear interval rồi chờ tick
đang chạy hoàn tất.

**FR-030 — Shutdown sạch:**
`SIGINT`/`SIGTERM` → dừng scheduler, chờ tick đang chạy, `mongoose.disconnect()`.
Shutdown lỗi → `process.exitCode = 1`. Idempotent qua cờ `shuttingDown`.

**FR-031 — Retry có giới hạn cho NDBC feed:**
Worker retry `NDBC_FETCH_RETRIES` lần (mặc định 3) với exponential backoff
`1s → 2s → 4s ...`, chặn trên 30 giây, timeout mỗi lần `NDBC_FETCH_TIMEOUT_MS`
(mặc định 20 giây). **Chỉ retry** với HTTP 408/429/5xx, `TypeError` (network), và
`AbortError`/`TimeoutError`. URL không hợp lệ → fail trước khi fetch.

**FR-032 — Fallback NDBC phía API dùng cấu hình khác worker:**
`app.ts` khởi tạo `new NdbcStationSource()` với default: timeout 15 giây,
**0 retry**. Đây là đường fallback cold-start của FR-003, không phải đường sync.

**FR-033 — Seed không đè dữ liệu writer chuẩn:**
API chỉ ghi `buoys` bằng `$setOnInsert` (lazy seed từ request weather với
`source: 'api-lazy-seed'`, cold seed từ `/buoys` với `source: 'api-cold-seed'`).
Không bao giờ ghi đè `name`/`lat`/`lon` đã có.

**FR-034 — Ẩn trạm đã chết:**
`listAll()` chỉ trả trạm có `lastSeenAt` trong 30 ngày gần nhất, hoặc trạm chưa có
field `lastSeenAt`.

### 2.6 Smart Weather Tips

**FR-035 — Sinh tip theo persona:**
Gemini nhận `systemInstruction` là prompt "Marine Weather Advisor" + user content
là JSON `{persona, weather}`, ép output theo `responseSchema`, `thinkingLevel: LOW`,
timeout 20 giây.

**FR-036 — Validate output của AI trước khi trả client:**
Bắt buộc `tips` là mảng 2–4 phần tử, mỗi phần tử là string ≤100 ký tự. `persona`
trong response **luôn được echo từ input**, không tin giá trị model trả về.

**FR-037 — Lỗi Gemini là lỗi upstream:**
Bất kỳ lỗi nào từ Gemini (quota, safety block, non-JSON, output không hợp lệ) được
gói thành `UpstreamUnavailableError` → HTTP 502, không phải 500.


---

## 3. Non-Functional Requirements

**NFR-001 — Nền tảng:**
Node ≥ 22, ESM, TypeScript `strict` + `noUncheckedIndexedAccess`. Build =
`tsc --noEmit` (type-check) rồi esbuild bundle 2 entry point với `--packages=external`.

**NFR-002 — Ranh giới kiến trúc:**
`domain/` (entity, error, value-object, use-case, port) không import framework hay
SDK. `adapters/` là nơi duy nhất biết Mongoose, Express, OWM/NOAA/NDBC JSON.
`config.ts` là nơi duy nhất đọc `process.env` (đã xác nhận bằng grep). `app.ts` là
composition root duy nhất khởi tạo concrete dependency.

**INFERRED** — Layout hiện tại đặt use-case và port trong `domain/`
(`domain/use-cases/`, `domain/repositories/`), tức layout kiểu `soosky-clean-core`,
**không** phải layout `application/use-cases` + `application/ports`. Đây là layout
đã chọn của dự án; feature mới nên giữ nguyên thay vì trộn hai kiểu.

**NFR-003 — Khả dụng khi upstream hỏng:**
Không nguồn ngoài nào được phép làm response thành 500. Cơ chế: `resilientSource`
(FR-018), stale-cache (FR-021), degrade rỗng (FR-019), map/tips → 502 (FR-014).
Comment tại error handler xác nhận 500 chỉ còn dành cho lỗi nội bộ ngoài dự kiến.

**NFR-004 — Kiểm soát chi phí provider:**
Bốn cơ chế cùng lúc: cache bền vững (FR-020), negative cache 2 phút (FR-018), kill
switch `MAP_TILES_ENABLED` (mặc định `false`), LRU tile cache trong RAM.

**NFR-005 — Rate limit:**
Sliding-window per-IP, in-memory, cửa sổ `RATE_LIMIT_WINDOW_MS` (60 giây), trần
`RATE_LIMIT_IP_MAX` (60). **Không có trần global** — lý do ghi trong code: trần
global chặn cả traffic hợp lệ khi đông người dùng thật. `/api/v1/maps/*` được miễn
hoàn toàn vì tile bùng nổ theo lô. State reset khi restart; có sweep định kỳ để Map
không phình.

**NFR-006 — Ràng buộc hiệu năng khi tra trạm gần nhất:**
Directory NDBC/NOAA (hàng nghìn trạm) được cache RAM 24 giờ với single-flight
(chống tải trùng khi cache lạnh). Tìm top-K bằng insertion tại chỗ, duyệt đúng 1
lần, không tạo mảng trung gian. Có test so khớp kết quả với bản
`map/filter/sort/slice` cũ trên directory ngẫu nhiên.

**NFR-007 — Observability:**
`meta.dataSources` trên mọi response (FR-013); log có tiền tố phân loại:
`[source-down]`, `[cache]`, `[weatherbit]`, `[buoys]`, `[station-dir]`, `[radar]`,
`[alerts]`, `[500]`, `[502]`. Worker log một dòng tổng kết mỗi vòng sync.

**NFR-008 — Bảo mật ở tầng vận hành:**

- API bind `127.0.0.1:3002` (`HTTP_HOST` mặc định) — không mở ra internet, đứng sau nginx.
- `buoy-sync` không expose port nào.
- `trust proxy = 1` — đúng 1 hop proxy; sai số hop sẽ làm rate limit per-IP sai.
- Body JSON giới hạn 64 KB.
- Secret chỉ qua `.env` / GitHub Secrets; `.env` nằm trong `.gitignore`.
- Client nhận message lỗi chung ở 500, chi tiết chỉ vào log server.

**NFR-009 — Fail-fast cấu hình:**
`config.ts` chỉ đọc env, không validate — env sai định dạng rơi về giá trị mặc định.
`app.ts` throw `MissingEnvVarError` khi thiếu `GEMINI_API_KEY` / `OWM_API_KEY` /
`WEATHERBIT_API_KEY`; `connectMongo` throw khi thiếu `MONGO_URI`.
Guard đặt ở `app.ts` chứ không ở `config.ts` để worker `buoySync` — cũng import
`config` nhưng chỉ cần Mongo + NDBC — không chết vì thiếu key nó không dùng.

**NFR-010 — Xác minh build:**
`npm run build` chạy `verify:build-output`, khẳng định tồn tại cả `dist/app.js` và
`dist/buoy-sync.js`, fail nếu thiếu.

**NFR-011 — Test:**
`node:test` chạy qua `tsx`, 18 file trong [test/](test/), không có framework test
bên thứ ba. Test dùng fixture deterministic và stub `fetch`/model; không gọi API
ngoài có phí. README yêu cầu chạy với `--test-concurrency=1`.

**NFR-012 — Deployment:**
2 process Node chạy trực tiếp trên VPS từ cùng một cây build: `node dist/app.js` và
`node dist/buoy-sync.js`, cwd = repo root (dotenv đọc `.env` theo cwd). Deploy tự động
khi push `master`/`main` qua SSH vào VPS: `git pull` + `npm ci` + `npm run build`.
Bước khởi động lại process do process manager bên ngoài đảm nhiệm — CI chưa gọi.
Worker phải chạy **một instance duy nhất** (2 worker song song sẽ cùng ghi `buoys`).

**NFR-013 — Tương thích ngược schema DB:**
Code đọc cache phải chịu được document cũ: `MongoPointWeatherCache` ép 4 field
condition về `null` khi thiếu; `MongoWeatherBitCache` coi `*CachedAt` thiếu là hết
hạn; `MongoOwmForecastCache` coi document thiếu `timezoneOffsetSeconds` là miss.

**NFR-014 — Không có SLA/quota được ghi nhận:**
Repository không chứa bất kỳ cam kết uptime, latency target, quota provider, hay
ngưỡng cảnh báo nào. Tài liệu này **không** phát biểu SLA.

---

## 4. External system, dữ liệu và cấu hình

### 4.1 Hệ thống ngoài

| Hệ thống | Endpoint | Dùng cho | Auth | Bằng chứng |
|---|---|---|---|---|
| NDBC realtime2 | `https://www.ndbc.noaa.gov/data/realtime2/{buoyId}.txt` | Số đo phao (cột cố định, `MM` = thiếu) | Không | [NdbcBuoyRepository.ts](src/adapters/ndbc/NdbcBuoyRepository.ts) |
| NDBC active stations | `https://www.ndbc.noaa.gov/activestations.xml` | Danh mục trạm (sync + locator) | Không | [NdbcStationSource.ts](src/adapters/ndbc/NdbcStationSource.ts), [StationLocator.ts:11](src/adapters/station/StationLocator.ts#L11) |
| NOAA CO-OPS datagetter | `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` | Tide predictions (2 call: `interval=h` + `interval=hilo`) | Không | [NoaaTideRepository.ts](src/adapters/noaa/NoaaTideRepository.ts) |
| NOAA mdapi | `.../mdapi/prod/webapi/stations.json?type=tidepredictions` | Danh mục trạm tide | Không | [StationLocator.ts:12](src/adapters/station/StationLocator.ts#L12) |
| OpenWeatherMap Current | `api.openweathermap.org/data/2.5/weather` | Thời tiết hiện tại theo toạ độ | `OWM_API_KEY` | [OwmCurrentRepository.ts](src/adapters/owm/OwmCurrentRepository.ts) |
| OWM Forecast (free) | `.../data/2.5/forecast` | Forecast 5 ngày / 3 giờ; `daily` gộp tay từ chính các bước 3h | `OWM_API_KEY` | [OwmForecastRepository.ts:8](src/adapters/owm/OwmForecastRepository.ts#L8) |
| OWM Weather Maps 1.0 | `tile.openweathermap.org/map/{layer}/{z}/{x}/{y}.png` | Map tile (**tính phí theo request**) | `OWM_API_KEY` | [OwmMapTileRepository.ts](src/adapters/owm/OwmMapTileRepository.ts) |
| WeatherBit Current | `api.weatherbit.io/v2.0/current` | `temp`, `uv`, `rh`, `dewpt` | `WEATHERBIT_API_KEY` | [WeatherBitCurrentRepository.ts](src/adapters/weatherbit/WeatherBitCurrentRepository.ts) |
| WeatherBit Alerts | `api.weatherbit.io/v2.0/alerts` | Cảnh báo thời tiết | `WEATHERBIT_API_KEY` | [WeatherBitAlertRepository.ts](src/adapters/weatherbit/WeatherBitAlertRepository.ts) |
| RainViewer | `api.rainviewer.com/public/weather-maps.json` | Frame radar toàn cầu | Không | [RainviewerRadarRepository.ts](src/adapters/rainviewer/RainviewerRadarRepository.ts) |
| Google Gemini | `@google/genai` SDK | Smart Weather Tips | `GEMINI_API_KEY` | [GeminiWeatherAdvisor.ts](src/adapters/gemini/GeminiWeatherAdvisor.ts) |
| MongoDB | `MONGO_URI` | Cache bền vững + collection `buoys` | Trong URI | [connectMongo.ts](src/adapters/mongo/connectMongo.ts) |

### 4.2 Collection MongoDB

| Collection (model) | Khoá unique | Vai trò | Bằng chứng |
|---|---|---|---|
| `buoys` (`BuoyStation`) | `buoyId`; index phụ `{lon, lat}` | **Dùng chung với bot** — danh mục trạm phao | [BuoyStationModel.ts](src/adapters/mongo/models/BuoyStationModel.ts) |
| `buoyweathercaches` | `buoyId` | Cache số đo NDBC | [BuoyWeatherCacheModel.ts](src/adapters/mongo/models/BuoyWeatherCacheModel.ts) |
| `pointweathercaches` | `{lat, lon}` | Cache OWM current | [PointWeatherCacheModel.ts](src/adapters/mongo/models/PointWeatherCacheModel.ts) |
| `owmforecastcaches` | `{lat, lon}` | Cache forecast | [OwmForecastCacheModel.ts](src/adapters/mongo/models/OwmForecastCacheModel.ts) |
| `weatherbitcaches` | `{lat, lon}` | Cache 2 nhịp humidity/uv | [WeatherBitCacheModel.ts](src/adapters/mongo/models/WeatherBitCacheModel.ts) |
| `tidechartcaches` | `{stationId, date, days, datum}` | Cache tide | [TideChartCacheModel.ts](src/adapters/mongo/models/TideChartCacheModel.ts) |
| `weatheralertcaches` | `{lat, lon}` | Cache alert | [WeatherAlertCacheModel.ts](src/adapters/mongo/models/WeatherAlertCacheModel.ts) |
| `radarcaches` | `key` (luôn `'radar'`) | Cache radar — đúng 1 document | [RadarCacheModel.ts](src/adapters/mongo/models/RadarCacheModel.ts) |

Không có thư mục migration nào trong repository. Schema tiến hoá
bằng tương thích ngược ở tầng đọc (NFR-013), không bằng migration script.

`buoys` là contract dùng chung: tên collection pin cứng, không dùng
`timestamps` của Mongoose mà tự quản `firstSeenAt`/`lastSeenAt`/`changedAt`.

### 4.3 Đơn vị đo (SI, đã chuẩn hoá tại adapter)

| Đại lượng | Đơn vị | Ghi chú |
|---|---|---|
| `temperature`, `waterTemp`, `dewPoint` | °C | OWM/WeatherBit gọi `units=metric` |
| `windSpeed`, `gust` | m/s | |
| `windDirection` | độ, 0–360 | Ngoài dải → `null` (Value Object) |
| `waveHeight` | m | Chỉ NDBC có |
| `atmospherePressure` | hPa | |
| `visibility` | m | NDBC trả hải lý → **× 1852**; OWM trả sẵn mét (cap 10000) |
| Tide `height` | m | NOAA gọi `units=metric` |
| `pop` | 0–1 | Xác suất mưa |
| `updatedAt` | ISO 8601 UTC | Thời điểm **đo**, không phải thời điểm request |

### 5.4 Biến môi trường

| Biến | Mặc định | Bắt buộc | Được đọc ở | Nhãn |
|---|---|---|---|---|
| `MONGO_URI` | — | **Có** (throw nếu thiếu) | [connectMongo.ts:11](src/adapters/mongo/connectMongo.ts#L11) | OBSERVED |
| `GEMINI_API_KEY` | — | **Có** (throw lúc boot API) | [app.ts:62](src/app.ts#L62) | OBSERVED |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Không | [config.ts:91](src/config.ts#L91) | OBSERVED |
| `OWM_API_KEY` | — | **Có** (throw lúc boot API) | [app.ts:63](src/app.ts#L63) | OBSERVED |
| `WEATHERBIT_API_KEY` | — | **Có** (throw lúc boot API) | [app.ts:64](src/app.ts#L64) | OBSERVED |
| `MAP_TILES_ENABLED` | `false` (chỉ `'true'` mới bật) | Không | [config.ts:84](src/config.ts#L84) | OBSERVED |
| `MONGO_MAX_POOL_SIZE` | `5` | Không (số nguyên dương) | [config.ts:68](src/config.ts#L68) | OBSERVED |
| `NDBC_ACTIVE_STATIONS_URL` | URL NDBC | Không | [config.ts:71](src/config.ts#L71) | OBSERVED |
| `NDBC_FETCH_TIMEOUT_MS` | `20000` | Không (số nguyên dương) | [config.ts:72](src/config.ts#L72) | OBSERVED |
| `NDBC_FETCH_RETRIES` | `3` | Không (số nguyên **không âm**) | [config.ts:73](src/config.ts#L73) | OBSERVED |
| `SYNC_INTERVAL_MS` | `86400000` | Không (số nguyên dương) | [config.ts:51-56](src/config.ts#L51-L56) | OBSERVED |
| `SYNC_RUN_ON_BOOT` | `true` (chỉ `'false'` mới tắt) | Không | [config.ts:77](src/config.ts#L77) | OBSERVED |
| `BUOY_SYNC_INTERVAL_MS` | — | Alias legacy, chỉ dùng khi thiếu `SYNC_INTERVAL_MS` | [config.ts:51-56](src/config.ts#L51-L56), [test/config.test.ts:21,40](test/config.test.ts#L21) | OBSERVED |
| `BUOY_SYNC_RUN_ON_BOOT` | — | Alias legacy tương tự | [config.ts:57-59](src/config.ts#L57-L59) | OBSERVED |
| `RATE_LIMIT_ENABLED` | `true` (chỉ `'false'` mới tắt) | Không | [config.ts:94](src/config.ts#L94) | OBSERVED |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Không | [config.ts:95](src/config.ts#L95) | OBSERVED |
| `RATE_LIMIT_IP_MAX` | `60` | Không | [config.ts:96](src/config.ts#L96) | OBSERVED |
| `HTTP_PORT` | `3002` | Không | [config.ts:63](src/config.ts#L63) | OBSERVED |
| `HTTP_HOST` | `127.0.0.1` | Không | [config.ts:64](src/config.ts#L64) | OBSERVED |
| `PORT` | — | **Không được code đọc** | [.env.example:2](.env.example#L2) khai nhưng `src/` không dùng | NEEDS CONFIRMATION (xem OQ-01) |
| `NODE_ENV` | — | **Không được `src/` đọc**; không còn nơi nào đặt sau khi bỏ Docker | — | NEEDS CONFIRMATION (xem OQ-02) |

---

## 5. Business rule và validation

### 5.1 Validate input tại biên HTTP

| Rule | Điều kiện | Kết quả khi sai | Bằng chứng |
|---|---|---|---|
| BR-01 | `stationId` khớp `^\d{7}$` | 400 | [Server.ts:238](src/http/Server.ts#L238) |
| BR-02 | `days` là chuỗi toàn chữ số (chặn `"1.9"`, `"2abc"`) và ∈ [1, 7] | 400 | [Server.ts:246-256](src/http/Server.ts#L246-L256) |
| BR-03 | `lat` ∈ [−90, 90], `lon` ∈ [−180, 180]; cả hai bắt buộc | 400 | [Server.ts:283-284](src/http/Server.ts#L283-L284) |
| BR-04 | `layer` ∈ `{windSpeed, temperature, pressure}` | 400 | [Server.ts:319-321](src/http/Server.ts#L319-L321) |
| BR-05 | `z`, `x`, `y` là số nguyên an toàn; `z` ∈ [3, 12]; `x`,`y` ∈ [0, 2^z − 1] | 400 | [Server.ts:322-332](src/http/Server.ts#L322-L332), [test/mapTileValidation.test.ts](test/mapTileValidation.test.ts) |
| BR-06 | `persona` ∈ 5 giá trị enum | 400 | [Server.ts:388-391](src/http/Server.ts#L388-L391) |
| BR-07 | `weather` chứa **đúng** 12 field cho phép, không thừa field lạ, không thiếu field nào (kể cả `tideChart`) | 400 | [WeatherTips.ts:186-198](src/domain/entities/WeatherTips.ts#L186-L198) |
| BR-08 | Measurement = number, numeric string (`"12.4"`), hoặc `"n/a"`/`"N/A"` | 400 | [WeatherTips.ts:167-170](src/domain/entities/WeatherTips.ts#L167-L170) |
| BR-09 | `weather.windDirection` ∈ [0, 360] | 400 (chặn giá trị la bàn dạng chữ) | [WeatherTips.ts:206-208](src/domain/entities/WeatherTips.ts#L206-L208), [test/weatherTipsValidation.test.ts:27](test/weatherTipsValidation.test.ts#L27) |
| BR-10 | `weather.humidity` ∈ [0, 100] | 400 | [WeatherTips.ts:221-223](src/domain/entities/WeatherTips.ts#L221-L223) |
| BR-11 | `weather.updatedAt` là ISO 8601 hợp lệ, `"n/a"`, hoặc `null` | 400 | [WeatherTips.ts:212-217](src/domain/entities/WeatherTips.ts#L212-L217) |
| BR-12 | `tideChart` là `null` hoặc object đúng `{stationId, predictions[]}`; **placeholder `"n/a"` bị từ chối** | 400 | [WeatherTips.ts:226-256](src/domain/entities/WeatherTips.ts#L226-L256), [test/weatherTipsValidation.test.ts:50](test/weatherTipsValidation.test.ts#L50) |
| BR-13 | Body JSON ≤ 64 KB | 413 (Express) | [Server.ts:145](src/http/Server.ts#L145) |

### 5.2 Domain rule

**BR-14 — Wind direction là Value Object:**
`WindDirection.from(value)` trả `null` nếu không phải số hữu hạn hoặc ngoài
[0, 360]. Áp dụng ở **cả 4 chỗ**: parse NDBC, parse OWM, đọc cache buoy, đọc cache
point — nên dữ liệu bẩn đã lưu trong DB cũng bị vô hiệu lúc đọc.

**BR-15 — Phân biệt 3 loại lỗi từ NOAA:**
NOAA nhồi mọi lỗi input vào `{error:{message}}` kèm HTTP 400. Adapter parse body
**trước**, không chặn ở `resp.ok`:

- message khớp `/not a valid station/i` → `StationNotFoundError` → 404
- message khác → `NoTideDataError` → 422 (trạm có thật nhưng không có prediction, ví dụ Great Lakes)
- body không phải JSON, hoặc `!resp.ok` mà không có `error` → `UpstreamUnavailableError` → 502

**BR-16 — `MM` của NDBC nghĩa là thiếu dữ liệu:**
Token `MM` hoặc không parse được → `null`, không phải 0.

**BR-17 — Hậu tố ngày/đêm cho icon:**
`conditionCode` = condition group id + `'d'`/`'n'` (ví dụ `"801d"`). Nguồn hậu tố:
ưu tiên ký tự cuối của `weather[0].icon` do OWM trả, fallback `sys.pod`. **Không**
tự suy từ giờ UTC. Điểm `daily` luôn ép `'d'` vì đại diện cả ngày.

**BR-18 — Cắt ngày theo giờ địa phương của toạ độ:**
Mọi phép chia ngày dùng `city.timezone` do OWM trả, **không** dùng UTC và **không**
dùng timezone của máy chủ. `daily[0].date` luôn là ngày của dải `hourly`.

**BR-19 — Chọn mốc giờ cho `hourly`:**
Các nhãn cách nhau 3 giờ, bắt đầu từ đầu giờ địa phương hiện tại + 3 giờ. Mốc 3h
của OWM lệch pha với nhãn sản phẩm nên nhãn được gán cho bản ghi đầu tiên không
sớm hơn mốc. Nếu gọi lúc đêm muộn mà hôm nay không còn bước nào →
rơi về ngày sớm nhất còn dữ liệu để dải giờ không rỗng.

**BR-20 — Gộp daily ở chế độ free:**
Free tier không có endpoint daily → gộp từ bước 3 giờ theo ngày địa phương, tối đa
5 ngày: `tempMin/tempMax` lấy biên, `windSpeed`/`pop` lấy **max** (thiên về cảnh
báo), `description`/`icon` lấy bước gần 12:00 giờ địa phương nhất.

**BR-21 — Chuẩn hoá key cache tide:**
`days` mặc định 1 và `datum` mặc định `MLLW` được normalize **trước** khi tạo
filter, để hai request tương đương trúng cùng document.

**BR-22 — Ghi cache là fire-and-forget khi seed:**
`seedIfAbsent` và `seedManyIfAbsent` được gọi bằng `void ... .catch(log)`, không
`await`, để không thêm độ trễ cho response.

---

## Phụ lục — Phương pháp và giới hạn

**Đã đọc:** `README.md`, `package.json`, `tsconfig.json`, `.env.example`,
`.gitignore`, `.github/workflows/deploy.yml`, `scripts/`, `docs/superpowers/specs/`, và toàn bộ
`src/` + `test/` (127 file tracked).

**Không đọc:** `node_modules/`, `dist/`, `.git/`, `.env`, `package-lock.json`, file nhị phân.

**Không thực hiện:** chạy service, gọi provider ngoài, sửa bất kỳ file code nào.

**Giới hạn:** Repository không chứa tài liệu sản phẩm gốc, không có issue tracker
được tham chiếu, và không có tài liệu API cho FE. Mọi phát biểu về **ý định** (khác
với **hành vi**) đều được đánh dấu INFERRED hoặc NEEDS CONFIRMATION.
