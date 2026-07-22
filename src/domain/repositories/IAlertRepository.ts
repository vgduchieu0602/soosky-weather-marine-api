import { WeatherAlerts } from "../entities/WeatherAlert";

// Query = input truyền vào (không phải data lưu trữ) -> khai ở port.
export type AlertQuery = {
    lat: number;
    lon: number;
}

export default interface AlertRepository {
    getAlerts(query: AlertQuery): Promise<WeatherAlerts>;
}
