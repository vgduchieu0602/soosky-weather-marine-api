import TideRepository from "../../domain/repositories/ITideRepository";
import { TideChart, TidePoint, TideExtreme, TideQuery } from "../../domain/entities/TideChart";

export { NoaaTidesRepository as default };

/* -------------------------------------------------------------------------- */

const NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

// Kiểu thô NOAA trả về — giữ tên tắt `t`/`v` vì đó là tên NOAA thật.
type NoaaPrediction = { t: string; v: string; type?: "H" | "L" };
type NoaaResponse = {
    predictions?: NoaaPrediction[];
    error?: { message: string };
};

/* -------------------------------------------------------------------------- */

class NoaaTidesRepository implements TideRepository {
    public async getTideChart(query: TideQuery): Promise<TideChart> {
        const days  = query.days  || 1;

        // NOAA nhận begin_date + end_date, không nhận 1 ngày lẻ -> tự đổi.
        const beginDate = query.date;
        const endDate   = this._addDays(query.date, days - 1); // days=1 -> end = begin

        const datum = query.datum || "MLLW";
        return this._fetchChart(query.stationId, beginDate, endDate, datum);
    }

    private async _fetchChart(stationId: string, beginDate: string, endDate: string, datum: string): Promise<TideChart> {
        const [curveRaw, hiloRaw] = await Promise.all([
            this._fetch(stationId, beginDate, endDate, datum, "6"),
            this._fetch(stationId, beginDate, endDate, datum, "hilo"),
        ]);

        const predictions: TidePoint[] = (curveRaw.predictions ?? []).map((p) => ({
            time:   this._toIso(p.t),
            height: parseFloat(p.v),
        }));

        const highLow: TideExtreme[] = (hiloRaw.predictions ?? []).map((p) => ({
            time:   this._toIso(p.t),
            height: parseFloat(p.v),
            type:   p.type as "H" | "L",
        }));

        return { stationId, predictions, highLow };
    }

    /**
     * Gọi 1 request NOAA với interval cho trước.
     */
    private async _fetch(
        stationId: string,
        beginDate: string,
        endDate:   string,
        datum:     string,
        interval:  string,
    ): Promise<NoaaResponse> {
        const params = new URLSearchParams({
            product:     "predictions",
            application: "soosky-weather",
            begin_date:  beginDate,
            end_date:    endDate,
            station:     stationId,
            datum:       datum,
            time_zone:   "gmt",
            units:       "metric", // ép mét (SI)
            interval:    interval,
            format:      "json",
        });

        const resp = await fetch(`${NOAA_BASE}?${params.toString()}`);
        if (!resp.ok) {
            throw new Error(`NOAA request failed: HTTP ${resp.status}`);
        }

        const data = (await resp.json()) as NoaaResponse;
        if (data.error) {
            throw new Error(`NOAA error: ${data.error.message}`);
        }

        return data;
    }

    private _addDays(yyyymmdd: string, n: number): string {
        const y = Number(yyyymmdd.slice(0, 4));
        const m = Number(yyyymmdd.slice(4, 6));
        const d = Number(yyyymmdd.slice(6, 8));

        const date = new Date(Date.UTC(y, m - 1, d));
        date.setUTCDate(date.getUTCDate() + n);

        const yy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        return `${yy}${mm}${dd}`;
    }

    /**
     * "2026-07-17 03:00" (GMT) -> "2026-07-17T03:00:00Z".
     */
    private _toIso(noaaTime: string): string {
        return noaaTime.replace(" ", "T") + ":00Z";
    }
}