import { WeatherAlerts, AlertQuery } from "../entities/WeatherAlert";

export default interface AlertRepository {
    getAlerts(query: AlertQuery): Promise<WeatherAlerts>;
}
