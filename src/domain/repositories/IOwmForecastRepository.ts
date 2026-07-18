import {OwmForecast, OwmForecastQuery} from "../entities/OwmForecast";

export default interface OwmForecastRepository {
    getForecast (query: OwmForecastQuery): Promise<OwmForecast>
}