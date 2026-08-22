import BuoyWeatherRepository, {BuoyQuery} from "../../domain/repositories/IBuoyWeatherRepository";
import {BuoyWeather} from "../../domain/entities/BuoyWeather";
import WindDirection from "../../domain/value-objects/WindDirection";

const NDBC_BASE = "https://www.ndbc.noaa.gov/data/realtime2";

const COL = {
    year: 0, month: 1, day: 2, hour: 3, min: 4,
    wdir: 5, // wind direction (deg)
    wspd: 6, // wind speed (m/s)
    gst: 7, // gust (m/s)
    wvht: 8, // wave height (m)
    pres: 12, // pressure (hPa)
    atmp: 13, //air temp (°C)
    wtmp: 14, // water temp (°C)
    vis: 16, // visibility (hải ký/ nmi)
};

const LOOKBACK_ROWS = 6;

/*----------------------------------------------------------------------------------*/

export default class NdbcBuoyRepository implements BuoyWeatherRepository {
    public async getBuoyWeather (query: BuoyQuery): Promise<BuoyWeather> {
        const text = await this._fetchText(query.buoyId);
        return this._parse(query.buoyId, text)
    }

    private async _fetchText (buoyId: string): Promise<string> {
        const res = await fetch(`${NDBC_BASE}/${buoyId}.txt`);

        if (!res.ok) {
            throw new Error(`NDBC request failed: HTTP ${res.status}`);
        }

        return res.text();
    }

    private _parse (buoyId: string, text: string): BuoyWeather {
        const rows = text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith("#"))
            .slice(0, LOOKBACK_ROWS)
            .map((line) => line.split(/\s+/));

        if (rows.length === 0) {
            throw new Error(`NDBC station ${buoyId} has no data.`);
        }

        const visNmi = this._latest(rows, COL.vis);

        return {
            buoyId,
            windDirection: this._latestWindDirection(rows),
            windSpeed: this._latest(rows, COL.wspd),
            gust: this._latest(rows, COL.gst),
            waveHeight: this._latest(rows, COL.wvht),
            atmospherePressure: this._latest(rows, COL.pres),
            temperature: this._latest(rows, COL.atmp),
            waterTemp: this._latest(rows, COL.wtmp),
            visibility: visNmi === null ? null : visNmi * 1852, // nmi -> m
            updatedAt: this._toIso(rows[0]!)
        }
    }

    // Giá trị non-MM mới nhất của 1 cột. rows đã sắp mới -> cũ (thứ tự của feed).
    private _latest (rows: string[][], col: number): number | null {
        for (const cols of rows) {
            const n = this._num(cols[col]);
            if (n !== null) return n;
        }

        return null;
    }

    // Riêng hướng gió: ngoài "MM" còn phải bỏ giá trị ngoài [0, 360] (feed có lúc
    // trả 361) -> coi như thiếu và lùi tiếp.
    private _latestWindDirection (rows: string[][]): number | null {
        for (const cols of rows) {
            const windDirection = WindDirection.from(this._num(cols[COL.wdir]));
            if (windDirection !== null) return windDirection.degrees;
        }

        return null;
    }

    private _num (token:string | undefined): number | null {
        if (token === undefined || token === "MM") {
            return null;
        }

        const n = parseFloat (token);

        return isNaN(n) ? null : n;
    }

    // Ghép 5 cột thời gian UTC -> ISO "2026-07-17T04:10:00Z"
    private _toIso (cols: string[]): string {
        const yyyy = cols[COL.year];
        const mm = cols[COL.month];
        const dd = cols[COL.day];
        const hh = cols[COL.hour];
        const min = cols[COL.min];

        return `${yyyy}-${mm}-${dd}T${hh}:${min}:00Z`;
    }
}




