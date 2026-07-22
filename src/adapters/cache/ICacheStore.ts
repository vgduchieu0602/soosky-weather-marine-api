// ============================================================================
// ICacheStore.ts — port cache store (tầng Interface Adapters). Adapter Mongo
// implement; cache decorator consume. KHÔNG phải use-case: cache là hạ tầng
// cross-cutting, không phải business rule -> không nằm trong domain/use-cases.
// ============================================================================

// 1 lần đọc cache: value đã map về entity domain + mốc ghi cache (freshAt) để
// tính TTL. freshAt = null -> coi như hết hạn (document cũ chưa có timestamp).
export interface CacheHit<V> {
    value: V;
    freshAt: Date | null;
}

// Q = kiểu key/query, V = entity. Nguồn không có key (radar) dùng Q = void.
export interface CacheStore<Q, V> {
    read(query: Q): Promise<CacheHit<V> | null>;
    write(query: Q, value: V): Promise<void>;
}
