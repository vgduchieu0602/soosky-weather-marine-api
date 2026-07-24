import BuoyStationRepository from '../../repositories/IBuoyStationRepository'
import BuoyStationSource from '../../repositories/IBuoyStationSource'
import { BuoyStation } from '../../entities/BuoyStation'

// ============================================================================
// Trả danh sách buoy cho FE vẽ bản đồ.
//  - Thường: đọc từ DB (bot đã crawl).
//  - Cold start (DB rỗng, bot chưa chạy vòng nào): fallback fetch NDBC trực tiếp
//    trả tạm cho FE, đồng thời seed vào DB (best-effort, lỗi ghi không chặn response).
// ============================================================================

export default class ListBuoysUseCase {
    constructor(
        private _repo: BuoyStationRepository,
        private _source: BuoyStationSource
    ) {}

    public async execute(): Promise<BuoyStation[]> {
        const fromDb = await this._repo.listAll()
        if (fromDb.length > 0) return fromDb

        // DB rỗng -> fallback. Nguồn lỗi -> trả rỗng (không làm sập request).
        let fromSource: BuoyStation[]
        try {
            fromSource = await this._source.listActive()
        } catch (err) {
            console.warn(`[buoys] fallback NDBC fetch failed: ${(err as Error)?.message ?? err}`)
            return []
        }

        // Seed nền, KHÔNG await -> không thêm độ trễ cho response.
        void this._repo.seedManyIfAbsent(fromSource)
            .catch((err) => console.warn(`[buoys] cold seed failed: ${(err as Error)?.message ?? err}`))

        return fromSource
    }
}
