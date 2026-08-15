// ============================================================================
// RateLimiter.ts — giới hạn request PER-IP, in-memory (KHÔNG Redis): mỗi IP có
// quota riêng trong 1 cửa sổ -> 1 client spam không ảnh hưởng người khác.
// Thuật toán: sliding window (log timestamp) -> không lỗi biên burst ~2x như
// fixed window. State chỉ nằm trong RAM 1 instance (reset khi restart).
// KHÔNG có trần global (tổng mọi IP): trần đó chặn cả traffic hợp lệ khi đông
// người dùng thật, chống quá tải để nginx/hạ tầng lo.
// ============================================================================

export default class RateLimiter {
    private _perIp = new Map<string, number[]>(); // ip -> timestamp trong cửa sổ
    private _sweep: ReturnType<typeof setInterval> | null = null;

    constructor(
        private _windowMs: number,
        private _ipMax: number,
        private _enabled: boolean = true
    ) {
        // Quét định kỳ xóa IP đã hết timestamp -> Map không phình vô hạn.
        // unref(): interval không giữ process sống (thoát bình thường khi tắt server).
        if (this._enabled) {
            this._sweep = setInterval(() => this._gc(), this._windowMs);
            this._sweep.unref?.();
        }
    }

    // true = IP này đã vượt quota (chặn); false = cho qua.
    public check(ip: string): boolean {
        if (!this._enabled) return false;

        const now = Date.now();
        const windowStart = now - this._windowMs;
        const key = ip || 'unknown';

        const hits = this._prune(this._perIp.get(key) ?? [], windowStart);
        if (hits.length >= this._ipMax) {
            this._perIp.set(key, hits); // lưu lại bản đã prune
            return true;
        }

        hits.push(now);
        this._perIp.set(key, hits);
        return false;
    }

    // Bỏ timestamp cũ hơn cửa sổ hiện tại.
    private _prune(arr: number[], windowStart: number): number[] {
        return arr.filter((t) => t > windowStart);
    }

    // Xóa IP không còn timestamp trong cửa sổ (giải phóng RAM).
    private _gc(): void {
        const windowStart = Date.now() - this._windowMs;
        for (const [ip, hits] of this._perIp) {
            const kept = this._prune(hits, windowStart);
            if (kept.length === 0) this._perIp.delete(ip);
            else this._perIp.set(ip, kept);
        }
    }
}
