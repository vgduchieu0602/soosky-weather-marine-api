import {WeatherDetail} from './WeatherDetail';

// ============================================================================
// Response của GET /api/v1/weather?lat=&lon=.
// Alias thẳng sang WeatherDetail — CÙNG shape với BuoyWeatherDetail. Xem
// WeatherDetail.ts để biết field nào endpoint này luôn null (buoyId).
// ============================================================================

export type PointWeatherDetail = WeatherDetail;
