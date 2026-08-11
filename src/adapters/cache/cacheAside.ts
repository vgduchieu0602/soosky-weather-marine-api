// ============================================================================
// cacheAside.ts — cơ chế cache-aside DÙNG CHUNG cho cache decorator. Hạ tầng
// (Interface Adapters), không phải business logic -> không nằm trong use-case.
// ============================================================================

import { CacheStore } from './ICacheStore'
import { recordDataSource } from '../../observability/responseTrace'

export function isFresh(freshAt: Date | string | null | undefined, ttlMs: number): boolean {
    if (!freshAt) return false;
    return Date.now() - new Date(freshAt).getTime() < ttlMs;
}

function asIso (value: Date | string | null | undefined): string | null {
    return value ? new Date(value).toISOString() : null
}

// Nguồn "theo ngày" (forecast daily OWM) phải reset khi sang ngày mới UTC, kể cả
// khi TTL 24h chưa chạy hết: ghi 15:36 thì 00:10 hôm sau danh sách daily đã lệch
// 1 ngày. Đo bằng ngày UTC để mọi instance/server nhất quán.
function isSameUtcDay (freshAt: Date | string): boolean {
    return new Date(freshAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
}

export interface CacheAsideOptions<V> {
    expiresOnUtcDayChange?: boolean;
    ttlMsForValue?: (value: V) => number;
}

// Cache còn tươi -> trả cache; hết hạn/trống -> gọi source, ghi cache, trả về.
// Refetch LỖI mà vẫn còn bản cache (dù stale) -> trả bản stale (data cũ tốt hơn
// 500). Chỉ ném lỗi khi HOÀN TOÀN không có cache để phục vụ.
export async function cacheAside<Q, V>(
    store: CacheStore<Q, V>,
    query: Q,
    ttlMs: number,
    fetchFresh: () => Promise<V>,
    source: string,
    options: CacheAsideOptions<V> = {}
): Promise<V> {
    const hit = await store.read(query);
    const sameDay = !options.expiresOnUtcDayChange || (!!hit?.freshAt && isSameUtcDay(hit.freshAt));
    const hitTtlMs = hit ? (options.ttlMsForValue?.(hit.value) ?? ttlMs) : ttlMs;
    if (hit && sameDay && isFresh(hit.freshAt, hitTtlMs)) {
        recordDataSource({ source, status: 'cache', dataFetchedAt: asIso(hit.freshAt) })
        return hit.value;
    }

    try {
        const fresh = await fetchFresh();
        recordDataSource({ source, status: 'upstream', dataFetchedAt: new Date().toISOString() })
        await store.write(query, fresh);
        return fresh;
    } catch (err) {
        if (hit) {
            recordDataSource({ source, status: 'stale-cache', dataFetchedAt: asIso(hit.freshAt) })
            console.warn(`[cache] refetch lỗi -> phục vụ bản stale: ${(err as Error)?.message ?? err}`);
            return hit.value;
        }
        recordDataSource({ source, status: 'unavailable', dataFetchedAt: null })
        throw err; // không có cache -> đành ném lên
    }
}
