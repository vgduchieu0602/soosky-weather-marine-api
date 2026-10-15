# Soosky Weather Marine API — API Reference

Mọi ví dụ trong file này lấy từ lần chạy thật ngày **2026-07-27** (không phải mẫu bịa).

- Base URL (local): `http://localhost:3002`
- Content-Type: `application/json` (trừ map tile trả `image/png`)
- Không cần authentication.

---

## 1. Quy ước chung

### 1.1 Response envelope

Thành công:

```json
{ "ok": true, "data": { } }
```

Thất bại:

```json
{ "ok": false, "code": "BAD_REQUEST", "reason": "Query params 'lat' and 'lon' are required." }
```

### 1.2 Quy tắc format `data`

| Giá trị trong domain | Trả về client |
|---|---|
| `number` (vd `12.3`) | `"12.3"` — **string**, không phải number |
| `null` / `undefined` / `NaN` | `"n/a"` |
| `string`, `boolean` | giữ nguyên |
| `array`, `object` | giữ nguyên, đệ quy vào bên trong |

FE phải `parseFloat()` trước khi tính toán, và check `=== "n/a"` thay vì `=== null`.

### 1.3 Bảng mã lỗi

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `BAD_REQUEST` | Thiếu param bắt buộc, sai kiểu, ngoài khoảng cho phép |
| 404 | `STATION_NOT_FOUND` | Station id đúng định dạng nhưng NOAA không có trạm đó |
| 404 | `NOT_FOUND` | Route không tồn tại |
| 422 | `NO_TIDE_DATA` | Trạm **có thật** nhưng NOAA không có dữ liệu tide prediction (vd trạm Great Lakes, trạm water-level-only) |
| 502 | `UPSTREAM_UNAVAILABLE` | Nguồn ngoài trục trặc ở endpoint không chịu được partial (map tile, weather tips) |
| 500 | `INTERNAL` | Lỗi nội bộ ngoài dự kiến |

422 là mã chuẩn RFC 9110 §15.5.21 — request hợp lệ về cú pháp nhưng không xử lý được về ngữ nghĩa. Nó **khác** 404: 404 nghĩa là trạm không tồn tại, 422 nghĩa là trạm tồn tại nhưng loại dữ liệu đó không có ở nguồn.

### 1.4 Partial success — nguồn lỗi KHÔNG làm hỏng response

Các endpoint gộp nhiều nguồn (`/weather`, `/buoys/:id/weather`) bọc mỗi nguồn bằng [`resilientSource`](../src/domain/use-cases/resilientSource.ts). Một nguồn chết chỉ làm field của nó thành `"n/a"`, **status vẫn 200**.

Nghĩa là: **200 OK không đảm bảo có dữ liệu**. FE phải xử lý được response mà mọi field đều `"n/a"`.

Nguồn vừa lỗi bị "nhớ lỗi" 2 phút (negative cache) — request kế tiếp trả `"n/a"` ngay, không gọi lại upstream.

### 1.6 Đơn vị đo lường

Nhớ: mọi số trong `data` đã bị đổi thành **string** ([§1.2](#12-quy-tắc-format-data--quan-trọng-cho-fe)), bảng dưới ghi đơn vị của giá trị **trước khi** thành string đó.

| Field | Đơn vị | Ghi chú |
|---|---|---|
| `temperature`, `waterTemp`, `dewPoint`, `tempMin`, `tempMax` | °C | Celsius (OWM/NDBC gọi kèm `units=metric`) |
| `windSpeed`, `gust` | m/s | mét/giây, KHÔNG phải km/h hay knot |
| `windDirection` | ° (độ) | 0–360, hướng gió thổi **từ** đâu tới (chuẩn khí tượng, không phải hướng gió thổi tới) |
| `waveHeight` | m | mét |
| `atmospherePressure` | hPa | hectopascal = millibar |
| `visibility` | m | mét (NDBC quy đổi ra SI, xem `NdbcBuoyRepository`) |
| `humidity` | % | độ ẩm tương đối |
| `uvIndex` | không đơn vị | thang UV Index chuẩn, 0–11+ |
| `pop` (forecast) | tỉ lệ 0–1 | xác suất mưa — `0.3` nghĩa là 30%, KHÔNG phải `30` |
| `lat`, `lon` | ° (độ) | decimal degrees, WGS84 |
| `height` (tide `predictions`/`highLow`) | m | mét (SI), datum **MLLW** |
| `uptime` (`/health`) | giây | |
| `time` (radar `past`/`nowcast`) | unix seconds | dạng string sau format |

---

## 2. `GET /health`

Không param. Không bị ảnh hưởng bởi bất kỳ nguồn ngoài nào.

```json
{ "ok": true, "data": { "uptime": "96.2781022" } }
```

---

## 3. `GET /api/v1/tides`

Biểu đồ thủy triều theo trạm NOAA CO-OPS.

### Query params

| Param | Bắt buộc | Kiểu | Mặc định | Validate |
|---|---|---|---|---|
| `stationId` | ✅ | string | — | Đúng **7 chữ số** (`/^\d{7}$/`) |
| `days` | ❌ | integer | `1` | Chuỗi chỉ gồm chữ số, giá trị `1..7` |

**Không có param `date`.** Backend tự set `date` = **hôm nay theo UTC** ([Server.ts](../src/http/Server.ts)). FE không truyền, cũng không thể chọn ngày khác. Nếu sau này cần chọn ngày, phải thêm param mới.

### Response 200

```json
{
  "ok": true,
  "data": {
    "stationId": "9414290",
    "predictions": [
      { "time": "2026-07-27T00:00:00Z", "height": "1.078" },
      { "time": "2026-07-27T01:00:00Z", "height": "1.22" }
    ],
    "highLow": [
      { "time": "2026-07-27T04:57:00Z", "height": "1.86",   "type": "H" },
      { "time": "2026-07-27T12:12:00Z", "height": "-0.084", "type": "L" }
    ]
  }
}
```

- `predictions`: 1 điểm/giờ, đơn vị **mét**, datum MLLW, timezone GMT. `days=1` → 24 điểm.
- `highLow`: mốc đỉnh (`H`) / chân (`L`) triều.

### Test cases

| # | Test data | Expected | Verified |
|---|---|---|---|
| T1 | `stationId=9414290&days=1` | 200, có `predictions` + `highLow` | ✅ |
| T2 | `stationId=8729108` (bỏ trống `days`) | 200, mặc định 1 ngày | ✅ |
| T3 | `stationId=9414290&days=7` (biên trên) | 200 | ✅ |
| T4 | `stationId=9414290&days=2` | 200, 48 điểm | ✅ |
| T5 | `stationId=` (rỗng) | 400 `BAD_REQUEST` — "Query param 'stationId' is required." | ✅ |
| T6 | `stationId=9ab909@` (ký tự đặc biệt) | 400 `BAD_REQUEST` — "'stationId' must be a 7-digit NOAA station id." | ✅ |
| T7 | `stationId=123` (thiếu chữ số) | 400 `BAD_REQUEST` | ✅ |
| T8 | `stationId=9009092` (7 số, không tồn tại) | 404 `STATION_NOT_FOUND` — "Station '9009092' does not exist." | ✅ |
| T9 | `stationId=9099090` (trạm Great Lakes) | 422 `NO_TIDE_DATA` — "Great Lakes stations don't have Predictions data." | ✅ |
| T10 | `days=0` | 400 — "'days' must be between 1 and 7." | ✅ |
| T11 | `days=-1` | 400 — "'days' must be a positive integer." | ✅ |
| T12 | `days=Mot` | 400 — "'days' must be a positive integer." | ✅ |
| T13 | `days=null` (chuỗi "null") | 400 — "'days' must be a positive integer." | ✅ |
| T14 | `days=1.9` | 400 — "'days' must be a positive integer." | ✅ |
| T15 | `days=8` / `days=400` | 400 — "'days' must be between 1 and 7." | ✅ |

### Station id hợp lệ để test

| stationId | Trạm |
|---|---|
| `9414290` | San Francisco, CA |
| `8729108` | Panama City, FL |
| `8518750` | The Battery, NY |
| `9447130` | Seattle, WA |

**Không dùng trạm Great Lakes** (`9099090`, …) — hồ nước ngọt không có thủy triều, NOAA không hề có sản phẩm predictions cho chúng. Nhận 422 là đúng, không phải bug.

---

## 4. `GET /api/v1/buoys`

Danh sách phao (vị trí + tên) để FE vẽ marker. Đọc từ MongoDB; DB rỗng thì fallback sang NDBC và seed nền.

Không param.

```json
{
  "ok": true,
  "data": [
    { "buoyId": "13001", "name": "NE Extension", "lat": "12", "lon": "-23" },
    { "buoyId": "13002", "name": "NE Extension", "lat": "21", "lon": "-23" }
  ]
}
```

| # | Test data | Expected | Verified |
|---|---|---|---|
| B1 | không param | 200, array không rỗng | ✅ |
| B2 | thêm query param thừa | 200, bị bỏ qua | ✅ |

---

## 5. `GET /api/v1/buoys/:buoyId/weather`

Chi tiết thời tiết tại 1 phao: số đo NDBC + tide + độ ẩm/UV (WeatherBit) + forecast (OWM).

> Đơn vị từng field số — xem [§1.6](#16-đơn-vị-đo-lường).

### Params

| Param | Vị trí | Bắt buộc | Validate |
|---|---|---|---|
| `buoyId` | path | ✅ | không rỗng (**không** kiểm tra tồn tại) |
| `lat` | query | ✅ | số, `-90..90` |
| `lon` | query | ✅ | số, `-180..180` |
| `tideStationId` | query | ❌ | không validate; bỏ trống thì tự tìm trạm gần nhất |

`lat`/`lon` bắt buộc dù đã có `buoyId` — dùng để tra trạm tide gần nhất và lấy WeatherBit/forecast theo toạ độ.

> **Shape ĐỒNG BỘ với `GET /api/v1/weather`.** Hai endpoint trả **đúng cùng một bộ key, cùng thứ tự** — xem [§ Shape chung](#shape-chung-cho-2-endpoint-weather). FE render bằng cùng 1 component, không phải rẽ nhánh theo endpoint.

### Response 200

```json
{
  "ok": true,
  "data": {
    "buoyId": "46026",
    "lat": "37.75",
    "lon": "-122.83",
    "conditionCode": "800n",
    "conditionMain": "Clear",
    "description": "clear sky",
    "icon": "01n",
    "temperature": "n/a",
    "windSpeed": "9",
    "windDirection": "310",
    "gust": "10",
    "waveHeight": "1.7",
    "waterTemp": "n/a",
    "atmospherePressure": "1016.4",
    "updatedAt": "2026-07-27T07:50:00Z",
    "visibility": "n/a",
    "tideStationId": "9414958",
    "buoyStationId": "46026",
    "tideChart": { "stationId": "9414958", "predictions": [ ], "highLow": [ ] },
    "uvIndex": "n/a",
    "humidity": "n/a",
    "dewPoint": "n/a",
    "forecast": {
      "hourly": [
        { "time": "2026-07-27T09:00:00Z", "temperature": "15.02", "windSpeed": "9.64", "pop": "0", "description": "clear sky", "conditionCode": "800d", "icon": "01d" },
        { "time": "2026-07-27T21:00:00Z", "temperature": "13.1", "windSpeed": "7.2", "pop": "0", "description": "few clouds", "conditionCode": "801n", "icon": "02n" }
      ],
      "daily": [
        { "date": "2026-07-27", "tempMin": "13.77", "tempMax": "23.63", "windSpeed": "12.03", "pop": "0", "description": "clear sky", "conditionCode": "800d", "icon": "01d" }
      ],
      "updatedAt": "2026-07-27T08:55:34.911Z"
    }
  }
}
```

`temperature`/`waterTemp` = `"n/a"` là bình thường — nhiều phao NDBC không có đủ cảm biến. `forecast` có thể là `"n/a"` nếu OWM lỗi.

### Tình trạng thời tiết hiện tại — card icon + nhãn + nhiệt độ

4 field top-level để FE vẽ card kiểu ☁️ "Cloudy" 24°, có ở **cả hai** endpoint weather:

| Field | Ví dụ | Dùng làm gì |
|---|---|---|
| `icon` | `"02d"`, `"01n"`, `"10d"` | Ảnh: `https://openweathermap.org/img/wn/{icon}@2x.png` |
| `conditionCode` | `"801d"`, `"800n"`, `"500d"` | Key map sang asset riêng của app (đã kèm hậu tố ngày/đêm) |
| `conditionMain` | `"Clouds"`, `"Clear"`, `"Rain"` | Nhãn ngắn — nguồn để FE dịch ra "Cloudy"/"Nhiều mây" |
| `description` | `"few clouds"`, `"light rain"` | Nhãn dài, chi tiết hơn |
| `temperature` | `"24"` | Số độ (**°C**) trên card |

- Nguồn: **OWM current theo `lat`/`lon`** ở cả 2 endpoint (kể cả endpoint phao) — NDBC là trạm cảm biến, không có khái niệm "trời nhiều mây". Nên card ở 2 màn hình luôn nhất quán.
- Hậu tố `d`/`n` lấy từ OWM (`weather[0].icon`), đã tính theo giờ mọc/lặn tại chính toạ độ đó.
- `conditionMain` là tiếng Anh của OWM (`Clouds`, không phải `Cloudy`). Muốn nhãn tiếng Việt / chữ hoa đúng thì FE map từ `conditionMain` hoặc `conditionCode`, đừng hiển thị thẳng.
- OWM lỗi → cả 4 field = `"n/a"`.

⚠️ **`temperature` ở endpoint phao lấy từ NDBC, KHÔNG phải OWM.** Nhiều phao thiếu cảm biến khí → trả `"n/a"` (vd phao `46026`) trong khi `conditionCode`/`icon` vẫn có. Card sẽ ra "☀️ Clear n/a°". Muốn luôn có số thì phải cho `temperature` fallback sang OWM current khi NDBC null — hiện **chưa** làm, giữ nguyên NDBC là nguồn sự thật cho phao.

### Shape chung cho 2 endpoint weather

`GET /api/v1/buoys/:buoyId/weather` và `GET /api/v1/weather` trả **đúng cùng 23 key, cùng thứ tự**. Backend dùng chung 1 entity (`domain/entities/WeatherDetail.ts`) nên 2 endpoint không thể lệch shape.

```
buoyId, lat, lon,
conditionCode, conditionMain, description, icon,
temperature, windSpeed, windDirection, gust, waveHeight, waterTemp,
atmospherePressure, updatedAt, visibility,
tideStationId, buoyStationId, tideChart,
uvIndex, humidity, dewPoint, forecast
```

| Key | `/buoys/:buoyId/weather` | `/weather?lat=&lon=` |
|---|---|---|
| `buoyId` | id client truyền vào | **luôn `"n/a"`** (endpoint không hỏi theo phao) |
| `lat`, `lon` | từ query param (bắt buộc) → luôn có | từ query param → luôn có |
| `conditionCode`, `conditionMain`, `description`, `icon` | OWM current | OWM current |
| `temperature`, `windSpeed`, `windDirection`, `gust`, `atmospherePressure`, `visibility`, `updatedAt` | NDBC (phao) | OWM current |
| `waveHeight`, `waterTemp` | NDBC (phao được hỏi) | phao gần nhất tự tra |
| `tideStationId`, `tideChart` | trạm NOAA gần nhất / client chỉ định | như trái |
| `buoyStationId` | = `buoyId` (phao cung cấp số đo) | phao gần nhất tự tra ra |
| `uvIndex`, `humidity`, `dewPoint` | WeatherBit | WeatherBit |
| `forecast` | OWM 5-day/3h | OWM 5-day/3h |

Quy tắc `"n/a"`:

- Field nào không lấy được → `null` ở domain → tầng HTTP đổi thành `"n/a"`. **Key luôn có mặt**, không bao giờ biến mất khỏi JSON.
- Số → chuỗi (`1.7` → `"1.7"`). `lat`/`lon` cũng vậy: `"37.75"`.
- Object lỗi/không có (`tideChart`, `forecast`) → nguyên cụm thành chuỗi `"n/a"`, không phải object rỗng. FE phải check `typeof x === "string"` trước khi đọc field con.

Ví dụ phao không tồn tại — `GET /api/v1/buoys/99999/weather?lat=10.5&lon=107.2` trả **200** (không phải 404), mọi field phao `"n/a"`, `lat`/`lon` vẫn giữ giá trị client truyền:

```json
{
  "buoyId": "99999", "lat": "10.5", "lon": "107.2",
  "conditionCode": "500d", "conditionMain": "Rain", "description": "light rain", "icon": "10d",
  "temperature": "n/a", "windSpeed": "n/a", "windDirection": "n/a", "gust": "n/a",
  "waveHeight": "n/a", "waterTemp": "n/a", "atmospherePressure": "n/a",
  "updatedAt": "n/a", "visibility": "n/a",
  "tideStationId": "n/a", "buoyStationId": "99999", "tideChart": "n/a",
  "uvIndex": "7", "humidity": "86", "dewPoint": "18.2", "forecast": { }
}
```

#### `conditionCode` / `icon` — mã icon có phân biệt ngày/đêm

Mỗi điểm `hourly`/`daily` trả thêm 2 field để FE chọn asset icon:

| Field | Ý nghĩa | Ví dụ |
|---|---|---|
| `conditionCode` | condition group id của OWM + hậu tố ngày/đêm | `"801d"`, `"801n"`, `"500n"` |
| `icon` | mã icon OWM tương ứng, cùng hậu tố | `"02d"`, `"02n"`, `"10n"` |

- Hậu tố `d` = ban ngày, `n` = ban đêm. Backend lấy trực tiếp từ OWM (`weather[0].icon` / `sys.pod`) — đã tính theo giờ mọc/lặn tại chính toạ độ đó, FE **không cần** tự tính.
- `daily` **luôn** hậu tố `d` (1 điểm đại diện cả ngày).
- Nguồn URL icon OWM: `https://openweathermap.org/img/wn/{icon}@2x.png`.
- Áp dụng cho cả `GET /api/v1/buoys/:buoyId/weather` và `GET /api/v1/weather`.

#### `forecast.hourly` — CHỈ các khung giờ của hôm nay

`hourly` chỉ trả các bước 3h thuộc **ngày hôm nay theo giờ địa phương tại chính toạ độ được hỏi**. Ngày mai trở đi nằm ở `forecast.daily`.

- Mốc chia ngày lấy từ `city.timezone` do OWM trả về — **không** phải UTC, cũng không phải timezone của máy chạy server. Vì vậy dải giờ của 1 điểm ở UTC+7 có thể trải qua 2 ngày UTC nhưng vẫn là 1 ngày địa phương.
- `daily` gộp theo **cùng mốc ngày** đó → `daily[0].date` luôn là ngày của dải `hourly`.
- **Số phần tử `hourly` thay đổi theo giờ gọi**: gói free chỉ có bước 3h và chỉ từ hiện tại trở đi. Gọi sáng sớm → tối đa 8 bước; gọi tối muộn → 1–2 bước. FE phải chịu được mảng ngắn, đừng hard-code 8.
- **Edge case đêm muộn**: nếu OWM không còn bước nào của hôm nay (gọi lúc ~23:xx giờ địa phương), backend rơi về ngày sớm nhất còn dữ liệu để dải giờ không rỗng — lúc đó `hourly` là của NGÀY MAI, và `daily[0].date` cũng là ngày mai (2 mảng vẫn khớp nhau).

Đo thật:

| Toạ độ | Giờ địa phương lúc gọi | `hourly` | Ngày địa phương |
|---|---|---|---|
| `10.5, 107.2` (UTC+7) | 13:59 | 3 bước — 16:00, 19:00, 22:00 | `2026-07-28` (1 ngày) |
| `37.75, -122.83` (UTC-7) | 23:59 | 8 bước — 02:00 → 23:00 | `2026-07-28` (1 ngày, trải 2 ngày UTC) |

### Test cases

| # | Test data | Expected | Verified |
|---|---|---|---|
| BW1 | `/buoys/46026/weather?lat=37.75&lon=-122.83` | 200, có `waveHeight`, `tideChart` | ✅ |
| BW2 | `/buoys/46026/weather` (thiếu lat/lon) | 400 — "Query params 'lat' and 'lon' are required." | ✅ |
| BW3 | `?lat=200&lon=-122.83` | 400 — "'lat' must be between -90 and 90." | ✅ |
| BW4 | `?lat=37.75&lon=999` | 400 — "'lon' must be between -180 and 180." | ✅ |
| BW5 | `?lat=abc&lon=-122.83` | 400 — "'lat' must be between -90 and 90." | ✅ |
| BW6 | `/buoys/99999/weather?lat=37.75&lon=-122.83` | **200**, mọi field phao = `"n/a"` | ✅ |
| BW7 | `?...&tideStationId=9414290` | 200, dùng đúng trạm chỉ định | ✅ |
| BW8 | `?...&tideStationId=abc` | 200, `tideChart` = `"n/a"` (không 400) | ✅ |
| BW9 | `/buoys/46026/weather?lat=37.75&lon=-122.83` | 200, có `lat="37.75"`, `lon="-122.83"`, `buoyStationId="46026"` | ✅ |
| BW10 | `/buoys/99999/weather?lat=10.5&lon=107.2` | 200, `lat="10.5"`, `lon="107.2"` vẫn giữ dù phao không tồn tại | ✅ |
| BW11 | `/buoys/46026/weather?lat=37.75&lon=-122.83` (ban đêm giờ địa phương) | 200, `conditionCode="800n"`, `icon="01n"`, `conditionMain="Clear"` | ✅ |
| BW12 | `/buoys/99999/weather?lat=10.5&lon=107.2` | 200, `conditionCode`/`icon` VẪN có dù phao không tồn tại (nguồn OWM theo lat/lon) | ✅ |

**BW6 cần chú ý:** phao không tồn tại vẫn trả 200 với toàn `"n/a"`, không phải 404. Đây là hệ quả của thiết kế partial-success — NDBC 404 bị nuốt thành `null`. Nếu QA yêu cầu 404 thì phải sửa use-case, hiện tại đang là hành vi có chủ ý.

---

## 6. `GET /api/v1/weather`

Thời tiết tại 1 toạ độ bất kỳ (không cần phao). Ghép OWM current + WeatherBit + forecast + tide + số đo sóng từ phao gần nhất.

### Query params

| Param | Bắt buộc | Validate |
|---|---|---|
| `lat` | ✅ | số, `-90..90` |
| `lon` | ✅ | số, `-180..180` |
| `tideStationId` | ❌ | không validate |

Shape response **giống hệt** `/buoys/:buoyId/weather` — cùng 23 key, cùng thứ tự, xem [§ Shape chung](#shape-chung-cho-2-endpoint-weather). Riêng endpoint này `buoyId` **luôn** `"n/a"` (không hỏi theo phao); phao dùng để bù `waveHeight`/`waterTemp` nằm ở `buoyStationId`.

### Test cases

| # | Test data | Expected | Verified |
|---|---|---|---|
| W1 | `?lat=37.8&lon=-122.5` | 200 | ✅ |
| W10 | `?lat=37.75&lon=-122.83` | 200, `buoyId="n/a"`, `buoyStationId` có giá trị (vd `"46237"`) | ✅ |
| W11 | so key với `/buoys/46026/weather?lat=37.75&lon=-122.83` | 2 response **cùng 23 key, cùng thứ tự** | ✅ |
| W12 | `?lat=10.5&lon=107.2` (Vũng Tàu, đang mưa) | 200, `conditionCode="500d"`, `conditionMain="Rain"`, `description="light rain"`, `icon="10d"`, `temperature="26.18"` | ✅ |
| W2 | `?lat=90&lon=180` (biên) | 200 | ✅ |
| W3 | `?lat=23.4&lon=25.6` (giữa sa mạc, không trạm) | 200, `tideChart`/`waveHeight` = `"n/a"` | ✅ |
| W4 | `?lat=37.8` (thiếu lon) | 400 | ✅ |
| W5 | không param | 400 | ✅ |
| W6 | `?lat=95&lon=-122.5` | 400 — "'lat' must be between -90 and 90." | ✅ |
| W7 | `?lat=37.8&lon=200` | 400 — "'lon' must be between -180 and 180." | ✅ |
| W8 | `?lat=abc&lon=-122.5` | 400 — "'lat' must be between -90 and 90." | ✅ |
| W9 | `?lat=&lon=-122.5` | 400 — "Query params 'lat' and 'lon' are required." | ✅ |

**Message của W8 gây hiểu nhầm:** `lat=abc` báo "must be between -90 and 90" trong khi vấn đề thật là sai kiểu. Do code check `isNaN(lat) || lat < -90 ...` gộp chung một message.

---

## 7. `GET /api/v1/alerts`

Cảnh báo thời tiết (WeatherBit) tại 1 toạ độ.

| Param | Bắt buộc | Validate |
|---|---|---|
| `lat` | ✅ | số, `-90..90` |
| `lon` | ✅ | số, `-180..180` |

```json
{
  "ok": true,
  "data": {
    "lat": "27.9",
    "lon": "-82.5",
    "alerts": [],
    "updatedAt": "2026-07-27T07:52:34.017Z"
  }
}
```

`alerts: []` = không có cảnh báo nào. Mỗi phần tử khi có: `{ title, severity, regions[], onsetLocal, endsLocal }`.

Ví dụ có cảnh báo (1 toạ độ có thể trả nhiều alert, nhiều mức khác nhau):

```json
{
  "ok": true,
  "data": {
    "lat": "34.7526",
    "lon": "-117.9942",
    "alerts": [
      { "severity": "Advisory", "title": "Heat Advisory issued July 27 at 3:04AM PDT until July 27 at 8:00PM PDT by NWS Los Angeles/Oxnard CA",
        "regions": ["Cuyama Valley", " Santa Clarita Valley"], "onsetLocal": "2026-07-27T03:04:00", "endsLocal": "2026-07-27T20:00:00" },
      { "severity": "Warning", "title": "Extreme Heat Warning issued July 27 at 3:04AM PDT until July 27 at 8:00PM PDT by NWS Los Angeles/Oxnard CA",
        "regions": ["Antelope Valley"], "onsetLocal": "2026-07-27T03:04:00", "endsLocal": "2026-07-27T20:00:00" },
      { "severity": "Watch", "title": "Beach Hazards Statement issued July 25 at 1:50PM PDT until July 29 at 6:00PM PDT by NWS Los Angeles/Oxnard CA",
        "regions": ["Ventura County Beaches"], "onsetLocal": "2026-07-25T13:50:00", "endsLocal": "2026-07-29T18:00:00" }
    ],
    "updatedAt": "2026-07-27T09:58:12.004Z"
  }
}
```

### `severity` — 3 mức FE cần xử lý

| `severity` | Ý nghĩa | Ví dụ `title` đã gặp thật |
|---|---|---|
| `Warning` | Hiện tượng ĐANG/CHẮC CHẮN xảy ra — mức nặng nhất | Extreme Heat Warning, Flash Flood Warning, Severe Thunderstorm Warning, Red Flag Warning |
| `Watch` | Có KHẢ NĂNG xảy ra — theo dõi, chưa chắc | Extreme Heat Watch, Severe Thunderstorm Watch, **Beach Hazards Statement** |
| `Advisory` | Bất tiện/nguy hiểm mức thấp | Heat Advisory, Dense Fog Advisory, **Air Quality Alert** |

Ràng buộc cho FE:

- **Switch theo `severity`, KHÔNG parse `title`.** `severity` không suy được từ hậu tố title: `Beach Hazards Statement` → `Watch`, `Air Quality Alert` → `Advisory`.
- Mảng `alerts` theo thứ tự của WeatherBit, **không sắp theo mức nặng**. Muốn Warning lên đầu thì FE tự sort.
- `regions` có phần tử **thừa space đầu** (`" St. John The Baptist"`) — WeatherBit split theo dấu phẩy mà không trim. FE phải `.trim()`.
- `onsetLocal`/`endsLocal` là **giờ địa phương KHÔNG có offset** (`"2026-07-27T20:00:00"`). Đừng `new Date()` rồi coi là UTC — sẽ lệch múi giờ.
- `title` đã chứa sẵn khoảng thời gian dạng chữ + tên đài NWS phát → dài (~90 ký tự). Cần rút gọn thì cắt ở ` issued `.

### Giới hạn vùng phủ (đã đo)

Alert của WeatherBit tại các toạ độ **giữa biển** trả `[]`, kể cả khi NWS đang có cảnh báo hàng hải ở đúng vùng đó. Đã thử: Special Marine Warning (Lake Michigan `42.73,-87.27`), Gale Warning (`35.2867,-121.5687`), Small Craft Advisory (`33.863,-119.7186`), Severe Thunderstorm Watch vùng nước Lake Superior (`46.65,-90.2563`) — **cả 4 đều rỗng**. Thử thêm 1 điểm ĐẤT sát bờ cạnh vùng Gale Warning (Morro Bay `35.3659,-120.8499`) cũng **không** thấy alert hàng hải, chỉ có alert đất liền.

→ Với app marine: endpoint này thực tế chỉ phủ **cảnh báo đất liền**. Cảnh báo hàng hải (marine/gale/small craft) muốn có thì phải lấy nguồn khác (NWS `api.weather.gov/alerts/active` free, không key, có zone hàng hải).

### Test cases

Coords dưới đây verify **thật** lúc 2026-07-27 ~09:5x UTC. Alert **hết hạn theo giờ** (nhiều cái sống < 1 tiếng) → chạy lại sau sẽ khác. Cách tìm coords mới ở dưới bảng.

| # | Test data | Expected | Verified |
|---|---|---|---|
| A1 | `?lat=27.9&lon=-82.5` | 200, `alerts` là array | ✅ |
| A2 | `?lat=37.8` | 400 | ✅ |
| A3 | `?lat=-95&lon=-122.5` | 400 | ✅ |
| A4 **Warning** | `?lat=34.7526&lon=-117.9942` | 200, 5 alert, có `severity="Warning"` (Extreme Heat Warning) | ✅ |
| A5 **Warning** ×3 | `?lat=39.1178&lon=-88.48` | 200, 3 alert **toàn** `Warning` (Severe Thunderstorm + Flash Flood + Extreme Heat) | ✅ |
| A6 **Warning** | `?lat=44.8731&lon=-114.6919` | 200, 1 alert `Warning` (Red Flag Warning) | ✅ |
| A7 **Watch** | `?lat=29.9729&lon=-90.757` | 200, 2 alert: 1 `Advisory` + 1 `Watch` (Extreme Heat Watch) | ✅ |
| A8 **Watch** | `?lat=48.059&lon=-90.6` | 200, 2 alert: 1 `Warning` + 1 `Watch` (Severe Thunderstorm Watch) | ✅ |
| A9 **Advisory** | `?lat=43.3619&lon=-88.2356` | 200, 1 alert `Advisory` (Dense Fog Advisory) | ✅ |
| A10 **đủ 3 mức** | `?lat=34.7526&lon=-117.9942` | 200, cùng response có `Advisory` + `Warning` + `Watch` — dùng test UI 3 màu | ✅ |
| A11 rỗng giữa biển | `?lat=33.863&lon=-119.7186` | 200, `alerts: []` dù NWS đang có Small Craft Advisory | ✅ |
| A12 rỗng | `?lat=27.9&lon=-82.5` | 200, `alerts: []` | ✅ |

**Tìm coords mới khi alert cũ hết hạn** — dùng NWS (free, không key, không quota):

```bash
curl -s -H "User-Agent: soosky-test" https://api.weather.gov/alerts/active \
  | jq -r '.features[] | select(.geometry != null)
           | "\(.properties.event) | lat=\(.geometry.coordinates[0][0][1]) lon=\(.geometry.coordinates[0][0][0])"' \
  | grep -E "Warning|Watch|Advisory" | head -20
```

Alert nào `geometry: null` (phần lớn) thì lấy `properties.affectedZones[0]`, `curl` URL zone đó rồi tính tâm polygon. Chỉ chọn điểm **trên đất liền** — xem mục giới hạn vùng phủ ở trên.

⚠️ WeatherBit tier Free quota rất chặt. Mỗi toạ độ mới = 1 call; cache 30 phút/toạ độ nên gọi lại cùng toạ độ trong 30' là miễn phí. Đừng sweep hàng loạt coords.

⚠️ **`alerts: []` KHÔNG phân biệt được "an toàn" với "upstream lỗi".** `GetAlertsUseCase` nuốt lỗi WeatherBit (hết quota, 429, timeout) và trả `alerts: []` + 200. Với tính năng cảnh báo an toàn thì đây là điểm cần cân nhắc sửa — thêm cờ kiểu `stale`/`degraded` vào response để FE biết là "không lấy được" chứ không phải "không có nguy hiểm".

---

## 8. `GET /api/v1/radar`

Metadata frame radar RainViewer để FE tự ghép URL tile.

| Param | Bắt buộc | Validate |
|---|---|---|
| `lat` | ✅ | số, `-90..90` |
| `lon` | ✅ | số, `-180..180` |

`lat`/`lon` được validate nhưng RainViewer trả metadata **toàn cầu** — response không phụ thuộc toạ độ.

```json
{
  "ok": true,
  "data": {
    "host": "https://tilecache.rainviewer.com",
    "past":    [ { "time": "1785135000", "path": "/v2/radar/06f099e44204" } ],
    "nowcast": [ ],
    "generatedAt": "2026-07-27T08:55:00.000Z"
  }
}
```

URL tile đầy đủ: `{host}{path}/256/{z}/{x}/{y}/2/1_1.png`. `time` là unix seconds (dạng string sau format).

| # | Test data | Expected | Verified |
|---|---|---|---|
| R1 | `?lat=37.8&lon=-122.5` | 200, `past` không rỗng | ✅ |
| R2 | không param | 400 | ✅ |

---

## 9. `GET /api/v1/maps/:layer/:z/:x/:y`

Proxy map tile OWM. Trả **PNG nhị phân**, không phải JSON.

| Param | Vị trí | Validate |
|---|---|---|
| `layer` | path | một trong `windSpeed`, `temperature`, `pressure` |
| `z`, `x`, `y` | path | integer |

Response 200: `Content-Type: image/png`, body là bytes ảnh.

Endpoint này **không** partial-success — OWM lỗi thì trả 502 `UPSTREAM_UNAVAILABLE` (ảnh không có "trạng thái rỗng" hợp lý).

| # | Test data | Expected | Verified |
|---|---|---|---|
| M1 | `/maps/windSpeed/5/5/12` | 200, `image/png` | ✅ |
| M2 | `/maps/rainfall/5/5/12` | 400 — "'layer' must be one of: windSpeed, temperature, pressure" | ✅ |
| M3 | `/maps/windSpeed/abc/5/12` | 400 — "'z', 'x', 'y' must be integers." | ✅ |
| M4 | OWM chết | 502 `UPSTREAM_UNAVAILABLE` | (không dựng được) |

Tile cache trong RAM 15 phút, tối đa 500 entry (LRU), **không** share giữa các instance. Response hiện **không** set `Cache-Control` — trình duyệt không cache lại.

---

## 10. `POST /api/v1/weather-tips`

Lời khuyên ngắn theo persona, sinh bởi Gemini. Dùng POST vì `weather` là object lớn, không hợp query string.

### Body

```json
{
  "persona": "Traveler",
  "weather": {
    "temperature": 24, "windSpeed": 12, "windDirection": 180, "gust": 18,
    "waveHeight": 1.2, "waterTemp": 22, "atmospherePressure": 1013,
    "updatedAt": "2026-07-27T00:00:00Z", "visibility": 10,
    "uvIndex": 6, "humidity": 70,
    "tideChart": {
      "stationId": "9414290",
      "predictions": [{ "time": "2026-07-27T01:00:00Z", "height": 1.1 }]
    }
  }
}
```

`persona` phải thuộc: `Traveler`, `Water Sports`, `Coastal Captain`, `Offshore Fishing`, `Other`.

`weather` phải khớp schema tại
[`weather-tips-input-schema.json`](../src/http/input-structure/weather-tips-input-schema.json).
`waveHeight`, `waterTemp`, `visibility`, và `humidity` có thể là `null`; Gemini sẽ bỏ qua tip phụ thuộc field đó.

Đơn vị input gợi ý theo đúng quy ước của 2 endpoint weather ([§1.6](#16-đơn-vị-đo-lường)): `temperature`/`waterTemp` °C, `windSpeed`/`gust` m/s, `atmospherePressure` hPa, `visibility` m, `uvIndex`/`humidity` như trên. Prompt Gemini ([weatherTips.ts](../src/adapters/gemini/instruction/weatherTips.ts)) cho phép knots/mph/inHg nếu nguồn khác, nhưng BE tự sinh luôn theo metric.

Body tối đa 64 KB.

### Response 200

```json
{
  "ok": true,
  "data": {
    "persona": "Traveler",
    "tips": [
      "The UV index is high; apply sunscreen frequently and wear protective gear.",
      "Expect a breeze with gusts up to 18; secure loose belongings."
    ]
  }
}
```

2–4 tip, mỗi tip ≤ 100 ký tự.

### Test cases

| # | Test data | Expected | Verified |
|---|---|---|---|
| P1 | persona hợp lệ + weather đầy đủ | 200, 2–4 tip | ✅ |
| P2 | `persona: "Astronaut"` | 400 — "'persona' must be one of: …" | ✅ |
| P3 | thiếu `persona` | 400 — "Body field 'persona' is required." | ✅ |
| P4 | thiếu `weather` | 400 — "Body field 'weather' (object) is required." | ✅ |
| P5 | `weather: "nong"` (string) | 400 — "Body field 'weather' (object) is required." | ✅ |
| P6 | body `{}` | 400 — "Body field 'persona' is required." | ✅ |
| P7 | `weather: {}` (object rỗng) | 400 — thiếu field weather bắt buộc | ✅ |
| P8 | `GET /api/v1/weather-tips` | 404 `NOT_FOUND` (route chỉ nhận POST) | ✅ |
| P9 | Gemini lỗi/quota | 502 `UPSTREAM_UNAVAILABLE` | (không dựng được) |

**P7 cần chú ý:** `weather: {}` vẫn tốn 1 lần gọi Gemini. Endpoint này **không cache** và API **không rate-limit**, nên số lần gọi Gemini tính phí bằng đúng số request nhận được.

---

## 11. Route không tồn tại

| Test data | Expected | Verified |
|---|---|---|
| `GET /api/v1/khongcogi` | 404 `NOT_FOUND` — "Not Found." | ✅ |

---

## 12. Ghi chú vận hành

### Cache TTL

| Dữ liệu | TTL | Nơi lưu |
|---|---|---|
| Point weather (OWM current) | 30 phút | MongoDB |
| Buoy weather (NDBC) | 30 phút | MongoDB |
| Tide chart (NOAA) | 1 ngày | MongoDB |
| Forecast (OWM) | 1 ngày | MongoDB |
| WeatherBit humidity | 1 giờ | MongoDB |
| WeatherBit uvIndex | 3 giờ | MongoDB |
| Alerts (WeatherBit) | 30 phút | MongoDB |
| Radar (RainViewer) | 10 phút | MongoDB |
| Map tile (OWM) | 15 phút | RAM, tối đa 500 entry |
| Danh bạ trạm NDBC/NOAA | 24 giờ | RAM |
| Weather tips (Gemini) | **không cache** | — |

Cache hết hạn mà refetch lỗi → phục vụ bản cũ (stale) thay vì trả lỗi.

### Biến môi trường

| Biến | Bắt buộc | Mặc định |
|---|---|---|
| `MONGO_URI` | ✅ | — |
| `GEMINI_API_KEY` | ✅ (app throw nếu thiếu) | — |
| `OWM_API_KEY` | ✅ (app throw nếu thiếu) | — |
| `WEATHERBIT_API_KEY` | ✅ (app throw nếu thiếu) | — |
| `GEMINI_MODEL` | ❌ | `gemini-3.1-flash-lite` |
| `HTTP_PORT` | ❌ | `3002` |
| `HTTP_HOST` | ❌ | `127.0.0.1` |

[`config.ts`](../src/config.ts) gọi `dotenv.config({ override: true })` — file `.env` **đè lên** biến môi trường của shell. Local không thể override tạm bằng `VAR=x npm run dev`. Trên VPS cũng vậy: biến do process manager tiêm vào sẽ bị `.env` ghi đè — cấu hình production phải đặt trong `.env`, không phải trong config của process manager.

### Hạn mức nhà cung cấp

| Nguồn | Free tier |
|---|---|
| OpenWeatherMap (current, forecast, tile) | 60 call/phút, 1M call/tháng |
| WeatherBit (current, alerts) | rất chặt ở tier Free — kiểm tra dashboard |
| Gemini | có hạn RPM + RPD theo model |
| NOAA CO-OPS, NDBC, RainViewer | không key, không hạn công bố |

Khi provider trả 429, các endpoint partial-success vẫn trả **200** với field `"n/a"` — client không thấy lỗi. Theo dõi log `[source-down]` để phát hiện.
