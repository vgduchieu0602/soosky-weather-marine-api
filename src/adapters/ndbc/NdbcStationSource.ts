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
    sleep?: (delayMs: number) => Promise<void>
}

const API_FALLBACK_TIMEOUT_MS = 15000
const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 30000

class NdbcHttpError extends Error {
    public constructor(
        public readonly status: number
    ) {
        super(`HTTP ${status}`)
    }
}

function sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, delayMs) })
}

export default class NdbcStationSource implements BuoyStationSource {
    constructor(private readonly options: NdbcStationSourceOptions = {
        url: config.ndbc.activeStationsUrl,
        timeoutMs: API_FALLBACK_TIMEOUT_MS,
        retries: 0
    }) {}

    public async listActive(): Promise<BuoyStation[]> {
        let lastError: unknown
        let attempts = 0
        for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
            attempts += 1
            const ctrl = new AbortController()
            const timer = setTimeout(() => ctrl.abort(), this.options.timeoutMs)
            try {
                const res = await fetch(this.options.url, { signal: ctrl.signal })
                if (!res.ok) throw new NdbcHttpError(res.status)
                return this._parse(await res.text())
            } catch (error) {
                lastError = error
                if (!this._isRetryable(error) || attempt === this.options.retries) break
            } finally {
                clearTimeout(timer)
            }

            const delayMs = Math.min(RETRY_BASE_DELAY_MS * (2 ** attempt), RETRY_MAX_DELAY_MS)
            await (this.options.sleep ?? sleep)(delayMs)
        }

        const reason = lastError instanceof Error ? lastError.message : String(lastError)
        const attemptLabel = attempts === 1 ? 'attempt' : 'attempts'
        throw new Error(`NDBC active-stations request failed after ${attempts} ${attemptLabel}: ${reason}`)
    }

    private _isRetryable(error: unknown): boolean {
        if (!(error instanceof NdbcHttpError)) return true
        return error.status === 408 || error.status === 429 || error.status >= 500
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
