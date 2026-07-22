// ============================================================================
// formatResponseData.ts — chuẩn hoá format cho `data` trước khi trả về client.
// Quy tắc (theo yêu cầu FE):
//   - number  -> string   (vd 12.3 -> "12.3")
//   - null / undefined / NaN -> "n/a"  (data lấy không được)
//   - string / boolean / object / array: giữ nguyên (array/object đệ quy)
// Áp ở tầng HTTP (Server.ts) nên domain/use-case vẫn giữ number|null thật.
// ============================================================================

const NA = "n/a";

export function formatResponseData(value: unknown): unknown {
    if (value === null || value === undefined) return NA;

    if (typeof value === "number") {
        return Number.isNaN(value) ? NA : String(value);
    }

    if (Array.isArray(value)) {
        return value.map(formatResponseData);
    }

    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = formatResponseData(v);
        }
        return out;
    }

    // string, boolean -> giữ nguyên
    return value;
}
