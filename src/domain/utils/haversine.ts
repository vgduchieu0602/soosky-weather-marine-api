// Khoảng cách great-circle (km) giữa 2 toạ độ — công thức haversine. Dùng để
// tìm trạm gần nhất theo lat/lon.
const EARTH_RADIUS_KM = 6371;

export function haversineKm (aLat: number, aLon: number, bLat: number, bLon: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);

    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
