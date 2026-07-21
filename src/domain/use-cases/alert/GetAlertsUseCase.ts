import AlertRepository from "../../repositories/IAlertRepository";
import { WeatherAlerts, AlertQuery } from "../../entities/WeatherAlert";

export default class GetAlertsUseCase {
    constructor(private _alertRepo: AlertRepository) {}

    public execute(query: AlertQuery): Promise<WeatherAlerts> {
        return this._alertRepo.getAlerts(query);
    }
}
