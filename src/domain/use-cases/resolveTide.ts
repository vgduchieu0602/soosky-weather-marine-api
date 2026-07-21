// ============================================================================
// resolveTide.ts — lấy tide chart cho use-case gộp, dùng chung buoy + point.
// - Có tideStationId (client truyền): dùng đúng trạm đó.
// - Không: thử LẦN LƯỢT vài trạm tide gần nhất, lấy trạm ĐẦU TIÊN có prediction
//   (trạm gần nhất theo khoảng cách có thể là trạm không có data -> giảm null).
// Mọi lời gọi qua resilientSource (lỗi -> null + log + negative-cache), KHÔNG throw.
// ============================================================================

import TideRepository from '../repositories/ITideRepository'
import StationLocator from '../repositories/IStationLocator'
import { TideChart } from '../entities/TideChart'
import { resilientSource } from './resilientSource'

export async function resolveTide (
    tideRepo: TideRepository,
    locator: StationLocator,
    override: string | undefined,
    lat: number,
    lon: number,
    date: string
): Promise<{ tideStationId: string | null; tideChart: TideChart | null }> {
    if (override) {
        const chart = await resilientSource('tide', `tide:${override}`,
            () => tideRepo.getTideChart({ stationId: override, date }));
        return { tideStationId: override, tideChart: chart };
    }

    const candidates = await locator.nearestTideStations(lat, lon);
    for (const c of candidates) {
        const chart = await resilientSource('tide', `tide:${c.id}`,
            () => tideRepo.getTideChart({ stationId: c.id, date }));
        if (chart) return { tideStationId: c.id, tideChart: chart };
    }
    // Không trạm nào có data -> null, nhưng vẫn báo trạm gần nhất đã thử (nếu có).
    return { tideStationId: candidates[0]?.id ?? null, tideChart: null };
}
