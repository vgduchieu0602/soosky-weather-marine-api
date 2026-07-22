import {OwmForecast} from "../entities/OwmForecast";

// Query = input truyền vào (không phải data lưu trữ) -> khai ở port.
export type OwmForecastQuery = {
    lat: number;
    lon: number;
}

export default interface OwmForecastRepository {
    getForecast (query: OwmForecastQuery): Promise<OwmForecast>
}
