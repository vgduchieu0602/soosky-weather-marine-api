// ============================================================================
// Station client gửi lên KHÔNG tồn tại trong hệ thống NOAA (id sai, id đã bị
// gỡ). Khác NoTideDataError: ở đó trạm CÓ thật nhưng không có tide prediction
// (vd Great Lakes) -> 422. Ở đây trạm không có thật -> HTTP map về 404, để FE
// phân biệt "chọn sai trạm" với "trạm này không hỗ trợ tide".
// ============================================================================

export default class StationNotFoundError extends Error {
    constructor (message: string) {
        super(message);
        this.name = "StationNotFoundError";
    }
}
