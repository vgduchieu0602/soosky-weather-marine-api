// ============================================================================
// IStationLocator.ts — port tra trạm gần nhất theo toạ độ. Implementation:
// StationLocator (tải directory NDBC + NOAA, haversine). Trả null nếu không có
// trạm trong bán kính cho phép (ngoài khơi xa) hoặc lỗi tải directory.
// ============================================================================

import {NearestStation} from '../entities/Station'

export default interface StationLocator {
    // Nhiều ứng viên tide gần nhất (gần->xa) — caller thử lần lượt vì trạm gần nhất
    // có thể không có prediction. Rỗng nếu không có trạm trong bán kính.
    nearestTideStations (lat: number, lon: number): Promise<NearestStation[]>;
    // Nhiều ứng viên buoy gần nhất (gần->xa) — thử lần lượt, lấy trạm có waveHeight thật.
    nearestBuoyStations (lat: number, lon: number): Promise<NearestStation[]>;
}
