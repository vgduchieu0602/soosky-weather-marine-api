import { BuoyStation } from '../entities/BuoyStation'

// Port: đọc/ghi vị trí buoy trong DB dùng chung. Ghi ở API chỉ là "lazy seed":
// insert khi buoyId chưa có, KHÔNG đè data bot đã crawl.
export default interface BuoyStationRepository {
    listAll(): Promise<BuoyStation[]>
    findByBuoyId(buoyId: string): Promise<BuoyStation | null>
    // Insert 1 buoy nếu chưa có (lazy seed từ request weather). Idempotent.
    seedIfAbsent(station: BuoyStation): Promise<void>
    // Insert nhiều buoy nếu chưa có (cold-start fallback seed). Idempotent.
    seedManyIfAbsent(stations: BuoyStation[]): Promise<void>
}
