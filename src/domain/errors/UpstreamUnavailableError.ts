// ============================================================================
// Upstream (NOAA...) trả HTTP lỗi hoặc không tới được -> sự cố tạm thời phía
// nguồn, KHÔNG phải lỗi nội bộ của ta -> HTTP map về 502 (Bad Gateway).
// ============================================================================

export default class UpstreamUnavailableError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'UpstreamUnavailableError'
    }
}
