import {TideChart} from './TideChart';
import {OwmForecast} from './OwmForecast';

// ============================================================================
// Entity TỔNG HỢP, hình dạng response cuối cùng của
// endpoint GET /api/v1/buoys/:buoyId/weather. Gộp field từ 
// BuoyWeather + TideChart + WeatherBit + OwmForecast lại thành 1 object.
// ============================================================================

export type BuoyWeatherDetailQuery = {
    buoyId: string;
    lat: number;
    lon: number;
    tideStationId?: string;
}

export interface BuoyWeatherDetail {
    buoyId: string;

    temperature: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    gust: number | null;
    waveHeight: number | null;
    waterTemp: number | null;
    atmospherePressure: number | null;
    updatedAt: string | null;
    visibility: number | null;

    // Trạm tide dùng để lấy tideChart (client truyền hoặc auto gần nhất). null nếu
    // không có/không resolve được.
    tideStationId: string | null;
    tideChart: TideChart | null;

    uvIndex: number | null;
    humidity: number | null;

    forecast: OwmForecast | null;
}
