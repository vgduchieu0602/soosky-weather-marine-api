import { BuoyStation } from '../entities/BuoyStation'

// Port: nguồn danh sách trạm active (adapter thật gọi NDBC). Chỉ dùng cho
// fallback lúc DB rỗng (cold start) — luồng thường đọc từ store.
export default interface BuoyStationSource {
    listActive(): Promise<BuoyStation[]>
}
