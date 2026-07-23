export default class GlobalRateLimiter {
    private _count = 0;
    private _windowStart = Date.now();

    constructor(
        private _windowMs: number,
        private _max: number,
        private _enabled: boolean = true
    ) {}

    // Gọi 1 lần / request. Trả `false` nghĩa là đã vượt giới hạn trong cửa sổ
    // hiện tại — nơi gọi tự quyết định throw lỗi gì (xem Server.ts).
    public allow(): boolean {
        if (!this._enabled) return true; // tắt rate limit -> luôn cho qua

        const now = Date.now();

        // Hết cửa sổ cũ -> reset đếm lại từ 0, bắt đầu cửa sổ mới.
        if (now - this._windowStart >= this._windowMs) {
            this._count = 0;
            this._windowStart = now;
        }

        this._count++;
        return this._count <= this._max;
    }
}
