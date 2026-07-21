// ============================================================================
// resilientSource.ts — bọc MỖI nguồn dữ liệu upstream. Nguồn lỗi -> trả null
// (partial) thay vì ném lên làm sập cả response. Server LOG rõ nguồn nào lỗi.
// Kèm "negative cache" 2 phút: nguồn vừa lỗi -> request kế trong cửa sổ đó trả
// null NGAY, không gọi lại upstream (tiết kiệm request + nhanh khi upstream chết).
// In-memory đúng bản chất (dấu-lỗi không cần persist/share).
// ============================================================================

const NEGATIVE_TTL_MS = 2 * 60 * 1000;

const failedUntil = new Map<string, number>();

export async function resilientSource<T> (
    source: string,
    key: string,
    factory: () => Promise<T>
): Promise<T | null> {
    const until = failedUntil.get(key);
    if (until !== undefined && Date.now() < until) {
        return null;   // đang nhớ-lỗi -> null, không đụng upstream
    }

    try {
        const result = await factory();
        failedUntil.delete(key);   // thành công -> xoá dấu lỗi (hồi phục ngay)
        return result;
    } catch (err) {
        failedUntil.set(key, Date.now() + NEGATIVE_TTL_MS);
        console.warn(`[source-down] ${source} (${key}) -> null: ${(err as Error)?.message ?? err}`);
        return null;
    }
}
