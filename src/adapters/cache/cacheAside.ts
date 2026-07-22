// ============================================================================
// cacheAside.ts — cơ chế cache-aside DÙNG CHUNG cho cache decorator. Hạ tầng
// (Interface Adapters), không phải business logic -> không nằm trong use-case.
// ============================================================================

import { CacheStore } from './ICacheStore'

export function isFresh(freshAt: Date | string | null | undefined, ttlMs: number): boolean {
    if (!freshAt) return false;
    return Date.now() - new Date(freshAt).getTime() < ttlMs;
}

// Cache còn tươi -> trả cache; hết hạn/trống -> gọi source, ghi cache, trả về.
export async function cacheAside<Q, V>(
    store: CacheStore<Q, V>,
    query: Q,
    ttlMs: number,
    fetchFresh: () => Promise<V>
): Promise<V> {
    const hit = await store.read(query);
    if (hit && isFresh(hit.freshAt, ttlMs)) {
        return hit.value;
    }

    const fresh = await fetchFresh();
    await store.write(query, fresh);
    return fresh;
}
