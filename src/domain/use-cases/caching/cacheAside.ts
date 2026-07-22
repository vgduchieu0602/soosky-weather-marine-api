// ============================================================================
// cacheAside.ts — orchestration cache-aside DÙNG CHUNG cho các nguồn có lưu trữ.
// Trước đây logic này nằm TRONG các Mongo repository (adapter). Đã tách ra:
//   - Adapter Mongo giờ chỉ là "cache store" thuần (read/write 1 document).
//   - Quyết định "cache còn tươi không / có refetch không" là NGHIỆP VỤ -> ở đây
//     (tầng use-case), không phải ở adapter.
// ============================================================================

// 1 lần đọc cache: value đã map sẵn về entity domain + mốc thời gian ghi cache
// (freshAt) để tính TTL. freshAt = null -> coi như hết hạn (document cũ chưa có
// timestamp) -> buộc refetch.
export interface CacheHit<V> {
    value: V;
    freshAt: Date | null;
}

// Port cache store: adapter (Mongo) implement. Q = kiểu key/query, V = entity.
// Nguồn không có key (vd radar) dùng Q = void.
export interface CacheStore<Q, V> {
    read(query: Q): Promise<CacheHit<V> | null>;
    write(query: Q, value: V): Promise<void>;
}

export function isFresh(freshAt: Date | string | null | undefined, ttlMs: number): boolean {
    if (!freshAt) return false;
    return Date.now() - new Date(freshAt).getTime() < ttlMs;
}

// Cache-aside: cache còn tươi -> trả cache; hết hạn/trống -> gọi source, ghi cache, trả về.
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
