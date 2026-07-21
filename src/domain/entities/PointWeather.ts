// ============================================================================
// Dữ liệu thời tiết "hiện tại" tại 1 điểm toạ độ bất kỳ (KHÔNG cần trạm buoy).
// Nguồn: OpenWeatherMap Current Weather API. Cùng shape với BuoyWeather để
// response nhất quán, NHƯNG waveHeight/waterTemp luôn null — OWM current không
// đo 2 đại lượng biển này (chỉ trạm buoy NDBC mới có).
// ============================================================================

export type PointWeatherQuery = {
    lat: number;
    lon: number;
}

export interface PointWeather {
    lat: number;
    lon: number;

    windDirection:      number | null; // độ (0 - 360)
    windSpeed:          number | null; // m/s
    gust:               number | null; // m/s
    waveHeight:         number | null; // luôn null — OWM current không có
    atmospherePressure: number | null; // hPa
    temperature:        number | null; // °C
    waterTemp:          number | null; // luôn null — OWM current không có
    visibility:         number | null; // m (OWM trả sẵn theo mét)

    updatedAt: string; // ISO 8601 UTC — thời điểm OWM đo (field `dt`)
}
