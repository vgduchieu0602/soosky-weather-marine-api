// ============================================================================
// IWeatherBitCacheStore.ts — port cache RIÊNG cho WeatherBit (2 field lệch nhịp
// humidity/uvIndex, 2 TTL + 2 timestamp riêng -> ghi từng phần). Tầng Interface
// Adapters. Orchestration dual-TTL ở CachedWeatherBitRepository.
// ============================================================================

import { WeatherBitQuery } from '../../domain/repositories/IWeatherBitRepository';

export interface WeatherBitCacheEntry {
    fetchedAt: string | null;
    temperature: number | null;
    humidity: number | null;
    dewPoint: number | null;    // cùng API call với humidity -> dùng chung humidityUpdatedAt
    humidityUpdatedAt: string;  //ISO UTC — lúc WeatherBit ĐO humidity/dewPoint (trả client)
    uvIndex: number | null;
    uvUpdatedAt: string;        //ISO UTC — lúc WeatherBit ĐO uvIndex (trả client)
    // Mốc GHI CACHE — dùng so TTL. TÁCH khỏi *UpdatedAt vì ob_time của WeatherBit
    // trễ 15-60 phút; đo TTL bằng ob_time làm cache hết hạn ngay khi vừa ghi.
    humidityCachedAt: string | null;
    uvCachedAt: string | null;
}

export interface WeatherBitCacheStore {
    read(query: WeatherBitQuery): Promise<WeatherBitCacheEntry | null>;
    // patch: chỉ ghi field hết hạn (merge), không đụng field còn tươi.
    write(query: WeatherBitQuery, patch: Partial<WeatherBitCacheEntry>): Promise<void>;
}
