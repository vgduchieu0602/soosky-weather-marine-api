// ============================================================================
// IWeatherBitCacheStore.ts — port cache RIÊNG cho WeatherBit (2 field lệch nhịp
// humidity/uvIndex, 2 TTL + 2 timestamp riêng -> ghi từng phần). Tầng Interface
// Adapters. Orchestration dual-TTL ở CachedWeatherBitRepository.
// ============================================================================

import { WeatherBitQuery } from '../../domain/repositories/IWeatherBitRepository';

export interface WeatherBitCacheEntry {
    humidity: number | null;
    humidityUpdatedAt: string;  //ISO UTC — lúc humidity lấy gần nhất
    uvIndex: number | null;
    uvUpdatedAt: string;        //ISO UTC — lúc uvIndex lấy gần nhất
}

export interface WeatherBitCacheStore {
    read(query: WeatherBitQuery): Promise<WeatherBitCacheEntry | null>;
    // patch: chỉ ghi field hết hạn (merge), không đụng field còn tươi.
    write(query: WeatherBitQuery, patch: Partial<WeatherBitCacheEntry>): Promise<void>;
}
