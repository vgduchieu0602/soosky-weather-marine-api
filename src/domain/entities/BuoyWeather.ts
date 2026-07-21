// ============================================================================
// Dữ liệu thời tiết đo tại 1 trạm phao NDBC.
// ============================================================================

export type BuoyQuery = {
    buoyId: string; //NDBC station ID, ví dụ "46053"
}

export interface BuoyWeather {
    buoyId: string;

    windDirection:      number | null; // độ (0 - 360 độ)
    windSpeed:          number | null; // m/s
    gust:               number | null; // m/s — gió giật
    waveHeight:         number | null; // m
    atmospherePressure: number | null; // hPa
    temperature:        number | null; // °C (không khí)
    waterTemp:          number | null; // °C (nước biển)
    visibility:         number | null; // m — đã quy đổi ra mét (SI), xem NdbcBuoyRepository

    updatedAt: string; // ISO 8601 UTC — thời điểm NDBC đo (KHÔNG phải thời điểm request)
}
