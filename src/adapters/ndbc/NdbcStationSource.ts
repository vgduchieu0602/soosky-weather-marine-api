import BuoyStationSource from '../../domain/repositories/IBuoyStationSource'
import { BuoyStation } from '../../domain/entities/BuoyStation'

// ============================================================================
// NdbcStationSource — fetch+parse activestations.xml (1 file, toàn bộ trạm
// active kèm id/lat/lon/name). Chỉ dùng cho FALLBACK lúc DB "buoys" rỗng.
// (Trùng logic StationLocator._loadBuoy nhưng StationLocator không lấy `name`
// và chỉ trả trạm gần nhất — không tái dùng cho list đầy đủ được.)
// ============================================================================

const NDBC_STATIONS_URL = 'https://www.ndbc.noaa.gov/activestations.xml'
const FETCH_TIMEOUT_MS = 15000

export default class NdbcStationSource implements BuoyStationSource {
    public async listActive(): Promise<BuoyStation[]> {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
        try {
            const res = await fetch(NDBC_STATIONS_URL, { signal: ctrl.signal })
            if (!res.ok) throw new Error(`NDBC request failed: HTTP ${res.status}`)
            return this._parse(await res.text())
        } finally {
            clearTimeout(timer)
        }
    }

    private _parse(xml: string): BuoyStation[] {
        const out: BuoyStation[] = []
        const tagRe = /<station\b[^>]*>/g
        let m: RegExpExecArray | null
        while ((m = tagRe.exec(xml)) !== null) {
            const tag = m[0]
            const id = this._attr(tag, 'id')
            const lat = Number(this._attr(tag, 'lat'))
            const lon = Number(this._attr(tag, 'lon'))
            const name = this._attr(tag, 'name')
            if (id && Number.isFinite(lat) && Number.isFinite(lon)) {
                out.push({ buoyId: id, name: name || null, lat, lon })
            }
        }
        return out
    }

    private _attr(tag: string, key: string): string | null {
        const m = tag.match(new RegExp(`\\b${key}="([^"]*)"`))
        return m ? m[1]! : null
    }
}
