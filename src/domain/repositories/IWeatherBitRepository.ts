import { WeatherBitCurrent, WeatherBitQuery } from "../entities/WeatherBitCurrent";

export default interface WeatherBitRepository {
    getWeatherBitCurrent (query: WeatherBitQuery):Promise<WeatherBitCurrent>
}