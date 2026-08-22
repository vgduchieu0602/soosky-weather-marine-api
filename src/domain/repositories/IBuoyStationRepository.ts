import { BuoyStation } from '../entities/BuoyStation'

// Port: đọc/ghi vị trí buoy trong DB dùng chung. Ghi ở API chỉ dùng data lấy từ
// feed NDBC (không bao giờ là toạ độ client) và KHÔNG đè data writer chuẩn
// (worker sync / bot) đã crawl.
export default interface BuoyStationRepository {
    // Danh sách trạm cho bản đồ. Loại doc placeholder do bản cũ của API ghi
    // (name null + toạ độ client) -> DB rác không chặn fallback feed.
    listAll(): Promise<BuoyStation[]>
    findByBuoyId(buoyId: string): Promise<BuoyStation | null>
    // Ghi 1 trạm lấy từ feed (request detail). Insert khi thiếu, vá doc
    // placeholder. Idempotent.
    saveFromFeed(station: BuoyStation): Promise<void>
    // Như trên, nhiều trạm (cold-start fallback của /buoys). Idempotent.
    saveManyFromFeed(stations: BuoyStation[]): Promise<void>
}
