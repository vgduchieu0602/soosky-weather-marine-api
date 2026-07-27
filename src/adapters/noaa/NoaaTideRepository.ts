import TideRepository, { TideQuery } from "../../domain/repositories/ITideRepository";
import { TideChart, TidePoint, TideExtreme } from "../../domain/entities/TideChart";
import NoTideDataError from "../../domain/errors/NoTideDataError";
import StationNotFoundError from "../../domain/errors/StationNotFoundError";
import UpstreamUnavailableError from "../../domain/errors/UpstreamUnavailableError";

export { NoaaTidesRepository as default };

/* -------------------------------------------------------------------------- */

const NOAA_BASE = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

// NOAA nhồi MỌI lỗi input vào chung 1 body {error:{message}} + HTTP 400, nên chỉ
// còn cách match message để phân biệt "trạm không tồn tại" (404) với "trạm có
// thật nhưng không có prediction" (422). Message thật:
//   " The station is not a valid station or there is system error."
const NOAA_UNKNOWN_STATION = /not a valid station/i;

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
        // interval "h" = 1 điểm/giờ (đủ dày để FE vẽ đường cong tide theo giờ,
        // nhẹ hơn "6" = 6 phút/điểm). "hilo" = các mốc đỉnh/chân để mark H/L.
        const [curveRaw, hiloRaw] = await Promise.all([
            this._fetch(stationId, beginDate, endDate, datum, "h"),
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

        // NOAA báo lỗi INPUT (trạm không có prediction, trạm không hợp lệ, sai
        // datum) qua body {error:{message}} — KÈM cả khi HTTP 400. Nên parse body
        // TRƯỚC, không chặn ở resp.ok. Body không phải JSON -> upstream trục trặc thật.
        let data: NoaaResponse;
        try {
            data = (await resp.json()) as NoaaResponse;
        } catch {
            throw new UpstreamUnavailableError(`NOAA request failed: HTTP ${resp.status} (non-JSON response)`);
        }

        if (data.error) {
            // Lỗi do trạm/datum client chọn -> phân biệt để HTTP trả 4xx, KHÔNG 500.
            const reason = (data.error.message ?? "").trim();

            if (NOAA_UNKNOWN_STATION.test(reason)) {
                throw new StationNotFoundError(`Station '${stationId}' does not exist.`);
            }

            throw new NoTideDataError(reason || "No tide prediction data for this station.");
        }

        if (!resp.ok) {
            throw new UpstreamUnavailableError(`NOAA request failed: HTTP ${resp.status}`);
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