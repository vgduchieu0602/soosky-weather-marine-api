// ============================================================================
// Dữ liệu thời tiết "hiện tại" tại 1 điểm toạ độ bất kỳ (KHÔNG cần trạm buoy).
// Nguồn: OpenWeatherMap Current Weather API. Cùng shape với BuoyWeather để
// response nhất quán, NHƯNG waveHeight/waterTemp luôn null — OWM current không
// đo 2 đại lượng biển này (chỉ trạm buoy NDBC mới có).
// ============================================================================

export interface PointWeather {
    lat: number;
    lon: number;

    // --- tình trạng thời tiết hiện tại (để FE vẽ card icon + nhãn + nhiệt độ) ---
    conditionCode:      string | null; // "801d" / "801n" — group id + hậu tố ngày/đêm
    conditionMain:      string | null; // "Clouds" — nhóm ngắn
    description:        string | null; // "few clouds" — mô tả dài
    icon:               string | null; // "02d" / "02n" — mã icon OWM

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
