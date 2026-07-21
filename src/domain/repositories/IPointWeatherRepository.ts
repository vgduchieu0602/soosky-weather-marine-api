// ============================================================================
// IPointWeatherRepository.ts — port cho thời tiết hiện tại tại 1 điểm toạ độ.
// 2 implementation: OwmCurrentRepository (gọi thẳng OWM) và
// MongoPointWeatherRepository (cache-aside qua Mongo, bọc quanh OwmCurrentRepository).
// ============================================================================

import {PointWeather, PointWeatherQuery} from '../entities/PointWeather'

export default interface PointWeatherRepository {
    getPointWeather (query: PointWeatherQuery): Promise<PointWeather>
}
