import {WeatherDetail} from './WeatherDetail';

// ============================================================================
// Response của GET /api/v1/buoys/:buoyId/weather.
// Alias thẳng sang WeatherDetail — CÙNG shape với PointWeatherDetail. Giữ tên
// riêng để use-case đọc đúng nghiệp vụ, nhưng alias (không copy field) nên 2
// endpoint KHÔNG THỂ lệch shape: sửa 1 chỗ là cả hai đổi theo.
// ============================================================================

export type BuoyWeatherDetail = WeatherDetail;
