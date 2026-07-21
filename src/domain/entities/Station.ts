// ============================================================================
// Station.ts — kết quả tra "trạm gần nhất" theo toạ độ. Dùng để auto-resolve
// tideStationId (NOAA) và buoyId (NDBC) từ lat/lon, giảm null.
// ============================================================================

export interface NearestStation {
    id: string;
    distanceKm: number;
}
