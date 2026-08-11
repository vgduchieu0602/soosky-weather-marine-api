import BuoyStationSource from '../../domain/repositories/IBuoyStationSource'
import { BuoyStation } from '../../domain/entities/BuoyStation'
import config from '../../config'

// ============================================================================
// NdbcStationSource — fetch+parse activestations.xml (1 file, toàn bộ trạm
// active kèm id/lat/lon/name). Chỉ dùng cho FALLBACK lúc DB "buoys" rỗng.
// (Trùng logic StationLocator._loadBuoy nhưng StationLocator không lấy `name`
// và chỉ trả trạm gần nhất — không tái dùng cho list đầy đủ được.)
// ============================================================================

type NdbcStationSourceOptions = {
    url: string
    timeoutMs: number
    retries: number
}

export default class NdbcStationSource implements BuoyStationSource {
    constructor(private readonly options: NdbcStationSourceOptions = {
        url: config.ndbc.activeStationsUrl,
        timeoutMs: config.ndbc.fetchTimeoutMs,
        retries: config.ndbc.retries
    }) {}

    public async listActive(): Promise<BuoyStation[]> {
        let lastError: unknown
        for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(), this.options.timeoutMs)
            try {
                const res = await fetch(this.options.url, { signal: ctrl.signal })
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return this._parse(await res.text())
            } catch (error) {
                lastError = error
            } finally {
                clearTimeout(timer)
            }
        }

        const reason = lastError instanceof Error ? lastError.message : String(lastError)
        throw new Error(`NDBC active-stations request failed after ${this.options.retries + 1} attempts: ${reason}`)
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
