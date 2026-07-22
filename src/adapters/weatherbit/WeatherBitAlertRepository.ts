import config from '../../config'
import AlertRepository, { AlertQuery } from "../../domain/repositories/IAlertRepository";
import { WeatherAlerts } from "../../domain/entities/WeatherAlert";

const WEATHERBIT_ALERTS_BASE = 'https://api.weatherbit.io/v2.0/alerts';

export default class WeatherBitAlertRepository implements AlertRepository {
    public async getAlerts(query: AlertQuery): Promise<WeatherAlerts> {
        const url = `${WEATHERBIT_ALERTS_BASE}?lat=${query.lat}&lon=${query.lon}&key=${config.weatherBit.apiKey}`;
        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`WeatherBit alerts request failed: HTTP ${resp.status}`);
        }

        const json: any = await resp.json();

        const rawAlerts: any[] = json.alerts ?? [];

        return {
            lat: query.lat,
            lon: query.lon,

            alerts: rawAlerts.map((a) => ({
                title: a.title ?? '',
                severity: a.severity ?? null,
                regions: a.regions ?? [],
                onsetLocal: a.onset_local ?? null,
                endsLocal: a.ends_local ?? null,
            })),
            updatedAt: new Date().toISOString(),
        };
    }
}
