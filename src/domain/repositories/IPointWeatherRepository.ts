// ============================================================================
// IPointWeatherRepository.ts — port cho thời tiết hiện tại tại 1 điểm toạ độ.
// 2 implementation: OwmCurrentRepository (gọi thẳng OWM) và
// CachedPointWeatherRepository (cache-aside qua Mongo store).
// ============================================================================

import {PointWeather} from '../entities/PointWeather'

// Query = input truyền vào (không phải data lưu trữ) -> khai ở port.
export type PointWeatherQuery = {
    lat: number;
    lon: number;
}

export default interface PointWeatherRepository {
    getPointWeather (query: PointWeatherQuery): Promise<PointWeather>
}
