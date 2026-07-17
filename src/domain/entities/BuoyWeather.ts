export type BuoyQuery = {
    buoyId: string; //NDBC station ID
}

export interface BuoyWeather {
    buoyId: string;

    windDirection:      number | null; // độ (0 - 360 độ)
    windSpeed:          number | null; // m/s
    gust:               number | null; // m/s
    waveHeight:         number | null; // m
    atmospherePressure: number | null; // hPa
    temperature:        number | null; // °C (không khí)
    waterTemp:          number | null; // °C (nước biển)
    visibility:         number | null; // m
    
    updatedAt: string; // ISO 8601 UTC — thời điểm NDBC đo
}