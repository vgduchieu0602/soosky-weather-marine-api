import {TideChart} from './TideChart';
import {OwmForecast} from './OwmForecast';

export type BuoyWeatherDetailQuery = {
    buoyId: string;
    lat: number;
    lon: number;
    tideStationId?: string;
}

export interface BuoyWeatherDetail {
    buoyId: string;
    windDirection: number | null;
    windSpeed: number | null;
    gust: number | null;
    waveHeight: number | null;
    atmospherePressure: number | null;
    temperature: number | null;
    waterTemp: number | null;
    visibility: number | null;
    updatedAt: string;

    tideChart: TideChart | null;
    uvIndex: number | null;
    humidity: number | null;
    forecast: OwmForecast | null;
}
