export type OwmForecastQuery = {
    lat: number;
    lon: number;
}

export interface HourlyForecastPoint {
    time: string;
    temperature: number | null;
    windSpeed: number | null;
    pop: number | null; //xác xuất mưa 0 - 1
    description: string | null;
}

export interface DailyForecastPoint {
    date: string; //YYYY-MM-DD
    tempMin: number | null;
    tempMax: number | null;
    windSpeed: number | null;
    pop: number | null;
    description: string | null;
}

export interface OwmForecast {
    lat: number;
    lon: number;
    hourly: HourlyForecastPoint[];
    daily: DailyForecastPoint[];
    updatedAt: string;
}