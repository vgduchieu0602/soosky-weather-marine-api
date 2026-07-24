// ============================================================================
// NOAA nhận request nhưng KHÔNG có dữ liệu tide prediction cho station/datum này
// (vd trạm Great Lakes, trạm water-level-only). Đây là lỗi INPUT (client chọn
// trạm không có prediction), KHÔNG phải sự cố hệ thống -> HTTP map về 4xx (422),
// không phải 500.
// ============================================================================

export default class NoTideDataError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'NoTideDataError'
    }
}
