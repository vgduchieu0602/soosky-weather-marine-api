import AlertRepository, { AlertQuery } from "../../repositories/IAlertRepository";
import { WeatherAlerts } from "../../entities/WeatherAlert";

export default class GetAlertsUseCase {
    constructor(private _alertRepo: AlertRepository) {}

    public async execute(query: AlertQuery): Promise<WeatherAlerts> {
        try {
            return await this._alertRepo.getAlerts(query);
        } catch (err) {
            // Upstream (WeatherBit) lỗi/rate-limit & không có cache -> degrade
            // "không có cảnh báo" (200) thay vì 500.
            console.warn(`[alerts] upstream lỗi -> degrade rỗng: ${(err as Error)?.message ?? err}`);
            return { lat: query.lat, lon: query.lon, alerts: [], updatedAt: new Date().toISOString() };
        }
    }
}
