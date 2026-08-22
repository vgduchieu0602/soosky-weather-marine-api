// ============================================================================
// resolveBuoyStation.ts — lấy metadata (name + vị trí THẬT) của trạm phao cho
// use-case detail.
//  1. DB "buoys" (worker sync / bot ghi) — nguồn chuẩn.
//  2. DB thiếu doc HOẶC doc có name null (placeholder do bản cũ lazy seed toạ độ
//     client) -> fallback activestations.xml, đúng nguồn mà endpoint list dùng
//     lúc DB rỗng.
// `fromFeed` để caller biết có nên ghi xuống DB hay không (data từ DB thì ghi
// lại là vô nghĩa).
// Mọi lỗi -> null + log, KHÔNG throw (detail là partial-response API).
// ============================================================================

import BuoyStationRepository from '../repositories/IBuoyStationRepository'
import BuoyStationSource from '../repositories/IBuoyStationSource'
import { BuoyStation } from '../entities/BuoyStation'

export type ResolvedBuoyStation = {
    station: BuoyStation | null
    fromFeed: boolean
}

export async function resolveBuoyStation (
    stationRepo: BuoyStationRepository,
    stationSource: BuoyStationSource,
    buoyId: string
): Promise<ResolvedBuoyStation> {
    try {
        const station = await stationRepo.findByBuoyId(buoyId);
        if (station?.name != null) return { station, fromFeed: false };
    } catch (err) {
        console.warn(`[buoys] metadata lookup failed for ${buoyId}: ${(err as Error)?.message ?? err}`);
    }

    try {
        const stations = await stationSource.listActive();
        return { station: stations.find((s) => s.buoyId === buoyId) ?? null, fromFeed: true };
    } catch (err) {
        console.warn(`[buoys] name fallback failed for ${buoyId}: ${(err as Error)?.message ?? err}`);
        return { station: null, fromFeed: true };
    }
}
