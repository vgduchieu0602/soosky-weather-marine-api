import {BuoyWeather, BuoyQuery} from '../entities/BuoyWeather'

export default interface BuoyWeatherRepository {
    getBuoyWeather (query: BuoyQuery): Promise<BuoyWeather>
}