import {TideChart} from './TideChart';
import {OwmForecast} from './OwmForecast';

// ============================================================================
// Entity TỔNG HỢP cho endpoint GET /api/v1/weather?lat=&lon= — thời tiết tại 1
// điểm bất kỳ. Song song với BuoyWeatherDetail nhưng nguồn "current" là OWM
// (theo toạ độ) thay vì NDBC (theo buoyId). Gộp PointWeather + TideChart +
// WeatherBit (uv/humidity) + OwmForecast.
// ============================================================================

export interface PointWeatherDetail {
    lat: number;
    lon: number;

    temperature: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    gust: number | null;
    waveHeight: number | null;
    waterTemp: number | null;
    atmospherePressure: number | null;
    updatedAt: string | null;
    visibility: number | null;

    // Trạm auto-resolve gần nhất (transparency): tide dùng cho tideChart, buoy dùng
    // để fill waveHeight/waterTemp. null nếu không có trạm trong bán kính / không resolve.
    tideStationId: string | null;
    buoyStationId: string | null;
    tideChart: TideChart | null;

    uvIndex: number | null;
    humidity: number | null;

    forecast: OwmForecast | null;
}
