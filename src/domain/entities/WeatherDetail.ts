import {TideChart} from './TideChart';
import {OwmForecast} from './OwmForecast';

// ============================================================================
// Entity TỔNG HỢP dùng CHUNG cho 2 endpoint:
//   - GET /api/v1/buoys/:buoyId/weather  (current từ NDBC theo buoyId)
//   - GET /api/v1/weather?lat=&lon=      (current từ OWM theo toạ độ)
//
// Cố ý MỘT shape duy nhất cho cả hai: FE render bằng cùng 1 component, không
// phải nhánh theo endpoint. Field nào endpoint đó không có -> `null` -> tầng HTTP
// (formatResponseData) đổi thành "n/a". KHÔNG được bỏ bớt key: key thiếu hẳn sẽ
// KHÔNG thành "n/a" mà biến mất khỏi JSON -> FE nhận undefined.
//
// Khác biệt nguồn dữ liệu giữa 2 endpoint (shape vẫn giống hệt):
//   buoyId        — chỉ endpoint buoy có; endpoint /weather luôn null.
//   buoyStationId — trạm phao thực sự cung cấp waveHeight/waterTemp.
//                   endpoint buoy = chính buoyId client yêu cầu;
//                   endpoint /weather = phao gần nhất tự tra ra.
// ============================================================================

export interface WeatherDetail {
    // --- định danh vị trí ---
    buoyId: string | null;
    lat: number | null;
    lon: number | null;

    // --- tình trạng thời tiết hiện tại (card icon + nhãn + nhiệt độ) ---
    // Nguồn: OWM current theo lat/lon — CẢ HAI endpoint. NDBC (phao) chỉ có số
    // đo cảm biến, không có khái niệm "trời nhiều mây".
    conditionCode: string | null;   // "801d" | "801n"
    conditionMain: string | null;   // "Clouds"
    description: string | null;     // "few clouds"
    icon: string | null;            // "02d" | "02n"

    // --- số đo hiện tại ---
    temperature: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    gust: number | null;
    waveHeight: number | null;
    waterTemp: number | null;
    atmospherePressure: number | null;
    updatedAt: string | null;
    visibility: number | null;

    // --- trạm liên quan + thuỷ triều ---
    tideStationId: string | null;
    buoyStationId: string | null;
    tideChart: TideChart | null;

    // --- WeatherBit ---
    uvIndex: number | null;
    humidity: number | null;

    // --- OWM forecast (kèm conditionCode/icon ngày-đêm) ---
    forecast: OwmForecast | null;
}
