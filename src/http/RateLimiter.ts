// ============================================================================
// RateLimiter.ts — giới hạn request 2 tầng, in-memory (KHÔNG Redis):
//   1. Per-IP: mỗi IP có quota riêng -> 1 client spam không ảnh hưởng người khác.
//   2. Global cap: trần tổng mọi IP cộng lại -> bảo vệ backend khỏi quá tải chung.
// Thuật toán: sliding window (log timestamp) -> không lỗi biên burst ~2x như
// fixed window. State chỉ nằm trong RAM 1 instance (reset khi restart).
// ============================================================================

export type RateLimitScope = 'IP' | 'GLOBAL' | null; // null = cho qua

export default class RateLimiter {
    private _global: number[] = [];              // timestamp mọi request trong cửa sổ
    private _perIp = new Map<string, number[]>(); // ip -> timestamp trong cửa sổ
    private _sweep: ReturnType<typeof setInterval> | null = null;

    constructor(
        private _windowMs: number,
        private _globalMax: number,
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

    // Trả scope bị chặn ('IP' | 'GLOBAL') hoặc null nếu cho qua.
    public check(ip: string): RateLimitScope {
        if (!this._enabled) return null;

        const now = Date.now();
        const windowStart = now - this._windowMs;

        // --- global ---
        this._global = this._prune(this._global, windowStart);
        if (this._global.length >= this._globalMax) return 'GLOBAL';

        // --- per-IP ---
        const key = ip || 'unknown';
        const hits = this._prune(this._perIp.get(key) ?? [], windowStart);
        if (hits.length >= this._ipMax) {
            this._perIp.set(key, hits); // lưu lại bản đã prune
            return 'IP';
        }

        // Qua cả 2 tầng -> ghi nhận request vào cả 2.
        hits.push(now);
        this._perIp.set(key, hits);
        this._global.push(now);
        return null;
    }

    // Bỏ timestamp cũ hơn cửa sổ hiện tại.
    private _prune(arr: number[], windowStart: number): number[] {
        return arr.filter((t) => t > windowStart);
    }

    // Xóa IP không còn timestamp trong cửa sổ (giải phóng RAM).
    private _gc(): void {
        const windowStart = Date.now() - this._windowMs;
        this._global = this._prune(this._global, windowStart);
        for (const [ip, hits] of this._perIp) {
            const kept = this._prune(hits, windowStart);
            if (kept.length === 0) this._perIp.delete(ip);
            else this._perIp.set(ip, kept);
        }
    }
}
