import { WeatherBitCurrent } from "../entities/WeatherBitCurrent";

// Query = input truyền vào (không phải data lưu trữ) -> khai ở port.
export type WeatherBitQuery = {
    lat: number;
    lon: number;
}

export default interface WeatherBitRepository {
    getWeatherBitCurrent (query: WeatherBitQuery):Promise<WeatherBitCurrent>
}
