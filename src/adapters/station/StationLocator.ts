// ============================================================================
// StationLocator.ts — tra trạm NDBC (buoy) / NOAA (tide) gần nhất theo toạ độ.
// Tải 2 "directory" (list mọi trạm + lat/lon), cache IN-MEMORY 24h (reference
// data đổi rất chậm), rồi haversine tìm gần nhất. Vượt cap khoảng cách -> null
// (ngoài khơi xa, không lấy trạm không đại diện). Lỗi tải -> null (best-effort,
// không làm sập request gọi nó).
// ============================================================================

import StationLocator from '../../domain/repositories/IStationLocator'
import {NearestStation} from '../../domain/entities/Station'
import {haversineKm} from '../../domain/utils/haversine'

const NDBC_STATIONS_URL = 'https://www.ndbc.noaa.gov/activestations.xml';
const NOAA_TIDE_STATIONS_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions';

const LIST_TTL_MS = 24 * 60 * 60 * 1000;   // directory đổi chậm -> cache 24h
const TIDE_MAX_KM = 150;
const BUOY_MAX_KM = 200;
// Trạm tide gần nhất theo khoảng cách CÓ THỂ không có prediction (subordinate/rác)
// -> trả vài ứng viên để caller thử lần lượt, lấy trạm đầu có data (giảm null).
const TIDE_CANDIDATES = 3;
// Buoy gần nhất cũng có thể 404 (trạm không có file realtime2) hoặc thiếu cảm biến
// sóng -> trả vài ứng viên để caller thử, lấy trạm có waveHeight thật.
const BUOY_CANDIDATES = 3;

type Station = { id: string; lat: number; lon: number };

// Directory cache: giữ list + thời điểm tải. `promise` để tránh tải trùng khi
// nhiều request đến cùng lúc lúc cache lạnh (single-flight).
type Cache = { at: number; stations: Station[] } | null;

export default class StationLocatorImpl implements StationLocator {
    private _tide: Cache = null;
    private _buoy: Cache = null;
    private _tideLoading: Promise<Station[]> | null = null;
    private _buoyLoading: Promise<Station[]> | null = null;

    // Trả nhiều ứng viên tide (sắp gần->xa, trong bán kính) để caller thử lần lượt.
    public async nearestTideStations (lat: number, lon: number): Promise<NearestStation[]> {
        const stations = await this._getTide();
        return this._nearestList(stations, lat, lon, TIDE_MAX_KM, TIDE_CANDIDATES);
    }

    public async nearestBuoyStations (lat: number, lon: number): Promise<NearestStation[]> {
        const stations = await this._getBuoy();
        return this._nearestList(stations, lat, lon, BUOY_MAX_KM, BUOY_CANDIDATES);
    }

    // ---- nearest list ----
    private _nearestList (stations: Station[], lat: number, lon: number, maxKm: number, limit: number): NearestStation[] {
        return stations
            .map((s) => ({ id: s.id, distanceKm: haversineKm(lat, lon, s.lat, s.lon) }))
            .filter((s) => s.distanceKm <= maxKm)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, limit);
    }

    // ---- directory load + cache (single-flight, best-effort) ----
    private async _getTide (): Promise<Station[]> {
        if (this._tide && Date.now() - this._tide.at < LIST_TTL_MS) return this._tide.stations;
        if (this._tideLoading) return this._tideLoading;
        this._tideLoading = this._loadTide()
            .then((stations) => { this._tide = { at: Date.now(), stations }; return stations; })
            .catch((err) => { console.warn(`[station-dir] tide load failed: ${(err as Error)?.message ?? err}`); return this._tide?.stations ?? []; })
            .finally(() => { this._tideLoading = null; });
        return this._tideLoading;
    }

    private async _getBuoy (): Promise<Station[]> {
        if (this._buoy && Date.now() - this._buoy.at < LIST_TTL_MS) return this._buoy.stations;
        if (this._buoyLoading) return this._buoyLoading;
        this._buoyLoading = this._loadBuoy()
            .then((stations) => { this._buoy = { at: Date.now(), stations }; return stations; })
            .catch((err) => { console.warn(`[station-dir] buoy load failed: ${(err as Error)?.message ?? err}`); return this._buoy?.stations ?? []; })
            .finally(() => { this._buoyLoading = null; });
        return this._buoyLoading;
    }

    private async _loadTide (): Promise<Station[]> {
        const res = await fetch(NOAA_TIDE_STATIONS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: any = await res.json();
        const raw: any[] = json.stations ?? [];
        // NOAA mdapi: {id, lat, lng}
        return raw
            .map((s) => ({ id: String(s.id), lat: Number(s.lat), lon: Number(s.lng) }))
            .filter((s) => s.id && Number.isFinite(s.lat) && Number.isFinite(s.lon));
    }

    private async _loadBuoy (): Promise<Station[]> {
        const res = await fetch(NDBC_STATIONS_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        // activestations.xml: mỗi trạm 1 thẻ `<station id="46026" lat="37.759" lon="-122.833" ...>`.
        // File phẳng (không lồng) -> regex trích id/lat/lon đủ dùng, khỏi thêm lib XML.
        const out: Station[] = [];
        const re = /<station\b[^>]*\bid="([^"]+)"[^>]*\blat="([^"]+)"[^>]*\blon="([^"]+)"[^>]*>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(xml)) !== null) {
            const lat = Number(m[2]);
            const lon = Number(m[3]);
            if (m[1] && Number.isFinite(lat) && Number.isFinite(lon)) {
                out.push({ id: m[1]!, lat, lon });
            }
        }
        return out;
    }
}
