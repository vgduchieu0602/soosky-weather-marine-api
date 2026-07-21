// ============================================================================
// InMemoryMapTileRepository.ts — cache TTL ngắn TRONG RAM cho map tile (ảnh PNG),
// KHÔNG lưu Mongo (ảnh nặng, không cần bền vững). Mục đích: khi user pan/zoom
// bản đồ, cùng 1 tile bị xin lại nhiều lần trong thời gian ngắn -> khỏi gọi OWM
// mỗi lần (tiết kiệm quota). Có GIỚI HẠN số entry (LRU) để RAM không phình vô hạn
// — đây là lý do trước đây bỏ in-memory; giờ thêm cap nên an toàn.
// ============================================================================

import MapTileRepository from '../../domain/repositories/IMapTileRepository'
import {MapTile, MapTileQuery} from '../../domain/entities/MapTile'

const TTL_MS = 15 * 60 * 1000;    // ngắn — đủ cho 1 phiên xem bản đồ
const MAX_ENTRIES = 500;          // ~500 tile x vài chục KB = vài chục MB trần

type Entry = { tile: MapTile; expiry: number };

export default class InMemoryMapTileRepository implements MapTileRepository {
    // Map giữ thứ tự chèn -> dùng làm LRU: hit thì xóa+set lại (đẩy xuống cuối),
    // evict thì xóa từ đầu (cũ nhất).
    private _cache = new Map<string, Entry>();

    constructor (private _inner: MapTileRepository) {}

    public async getTile (query: MapTileQuery): Promise<MapTile> {
        const key = `${query.layer}:${query.z}:${query.x}:${query.y}`;

        const hit = this._cache.get(key);
        if (hit && Date.now() < hit.expiry) {
            this._cache.delete(key);
            this._cache.set(key, hit);   // refresh recency
            return hit.tile;
        }

        const tile = await this._inner.getTile(query);
        this._cache.set(key, { tile, expiry: Date.now() + TTL_MS });
        this._evict();
        return tile;
    }

    private _evict (): void {
        if (this._cache.size <= MAX_ENTRIES) return;
        // Dọn entry hết hạn trước.
        const now = Date.now();
        for (const [k, e] of this._cache) {
            if (now >= e.expiry) this._cache.delete(k);
        }
        // Vẫn quá cap -> xóa cũ nhất (đầu Map) tới khi vừa.
        while (this._cache.size > MAX_ENTRIES) {
            const oldest = this._cache.keys().next().value;
            if (oldest === undefined) break;
            this._cache.delete(oldest);
        }
    }
}
