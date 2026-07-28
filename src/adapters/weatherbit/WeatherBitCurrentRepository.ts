import config from '../../config';
import WeatherBitRepository, { WeatherBitQuery } from '../../domain/repositories/IWeatherBitRepository';
import { WeatherBitCurrent } from '../../domain/entities/WeatherBitCurrent';

const WEATHERBIT_BASE = 'https://api.weatherbit.io/v2.0/current';

export default class WeatherBitCurrentRepository implements WeatherBitRepository {
    public async getWeatherBitCurrent (query: WeatherBitQuery): Promise<WeatherBitCurrent> {
        const url = `${WEATHERBIT_BASE}?lat=${query.lat}&lon=${query.lon}&key=${config.weatherBit.apiKey}`;

        const res = await fetch(url)

        if (!res.ok) {
            throw new Error(`WeatherBit request failed: HTTP ${res.status}`);
        }

        const json: any = await res.json();
        const d = json.data?.[0];

        if (!d) {
            throw new Error("WeatherBit returned no data.")
        }

        return {
            lat: query.lat,
            lon: query.lon,
            
            uvIndex: d.uv ?? null,
            humidity: d.rh ?? null,
            dewPoint: d.dewpt ?? null,
            
            updatedAt: new Date(d.ts * 1000).toISOString()
        }
    }
}