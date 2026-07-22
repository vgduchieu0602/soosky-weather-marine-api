// ============================================================================
// IWeatherBitCacheStore.ts — port cache RIÊNG cho WeatherBit. Không dùng
// CacheStore generic vì WeatherBit có 2 field lệch nhịp (humidity/uvIndex) với
// 2 TTL + 2 timestamp riêng -> ghi từng phần (partial). Orchestration dual-TTL
// nằm ở CachedWeatherBitRepository (use-case), store chỉ read/write thuần.
// ============================================================================

import { WeatherBitQuery } from '../../repositories/IWeatherBitRepository';

export interface WeatherBitCacheEntry {
    humidity: number | null;
    humidityUpdatedAt: string;  //ISO UTC — lúc humidity lấy gần nhất
    uvIndex: number | null;
    uvUpdatedAt: string;        //ISO UTC — lúc uvIndex lấy gần nhất
}

export interface WeatherBitCacheStore {
    read(query: WeatherBitQuery): Promise<WeatherBitCacheEntry | null>;
    // patch: chỉ ghi các field hết hạn (merge), không đụng field còn tươi.
    write(query: WeatherBitQuery, patch: Partial<WeatherBitCacheEntry>): Promise<void>;
}
