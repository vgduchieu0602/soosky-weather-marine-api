// ============================================================================
// resolveBuoyName.ts — lấy TÊN trạm phao cho use-case detail.
//  1. DB "buoys" (bot crawl ghi) — nguồn chuẩn.
//  2. DB thiếu doc HOẶC doc có name null (lazy seed của API insert name: null,
//     rồi seedManyIfAbsent chỉ $setOnInsert nên không bao giờ vá) -> fallback
//     activestations.xml, đúng nguồn mà endpoint list đang dùng lúc DB rỗng.
// Mọi lỗi -> null + log, KHÔNG throw (detail là partial-response API).
// ============================================================================

import BuoyStationRepository from '../repositories/IBuoyStationRepository'
import BuoyStationSource from '../repositories/IBuoyStationSource'

export async function resolveBuoyName (
    stationRepo: BuoyStationRepository,
    stationSource: BuoyStationSource,
    buoyId: string
): Promise<string | null> {
    try {
        const station = await stationRepo.findByBuoyId(buoyId);
        if (station?.name != null) return station.name;
    } catch (err) {
        console.warn(`[buoys] metadata lookup failed for ${buoyId}: ${(err as Error)?.message ?? err}`);
    }

    try {
        const stations = await stationSource.listActive();
        return stations.find((s) => s.buoyId === buoyId)?.name ?? null;
    } catch (err) {
        console.warn(`[buoys] name fallback failed for ${buoyId}: ${(err as Error)?.message ?? err}`);
        return null;
    }
}
