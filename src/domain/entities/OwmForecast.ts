// ============================================================================
// Dữ liệu forecast từ OWM: `hourly` = CHỈ các bước 3h của NGÀY HÔM NAY (theo
// giờ địa phương tại toạ độ đó), `daily` = 5 ngày tổng hợp. Hai mảng chia ngày
// theo cùng 1 mốc nên `daily[0].date` luôn là ngày của dải `hourly`.
//
// conditionCode / icon: mã để FE chọn asset, LUÔN có hậu tố ngày/đêm 'd'|'n'.
//   - conditionCode = condition group id của OWM + hậu tố, vd 801 -> "801d" / "801n"
//   - icon          = mã icon OWM tương ứng, vd "02d" / "02n"
// FE không phải tự tính giờ mọc/lặn: hậu tố lấy từ chính bước dữ liệu OWM
// (weather[0].icon / sys.pod). Điểm `daily` đại diện cả NGÀY nên luôn 'd'.
// ============================================================================

export interface HourlyForecastPoint {
    time: string;
    temperature: number | null;
    windSpeed: number | null;
    pop: number | null; //xác xuất mưa 0 - 1
    description: string | null;
    conditionCode: string | null;   //vd "801d" | "801n"
    icon: string | null;            //vd "02d"  | "02n"
}

export interface DailyForecastPoint {
    date: string; //YYYY-MM-DD
    tempMin: number | null;
    tempMax: number | null;
    windSpeed: number | null;
    pop: number | null;
    description: string | null;
    conditionCode: string | null;   //luôn hậu tố 'd' — đại diện cả ngày
    icon: string | null;            //luôn hậu tố 'd'
}

export interface OwmForecast {
    lat: number;
    lon: number;
    timezoneOffsetSeconds: number; // lệch giờ địa phương tại toạ độ forecast so với UTC
    hourly: HourlyForecastPoint[];
    daily: DailyForecastPoint[];
    updatedAt: string;
}
