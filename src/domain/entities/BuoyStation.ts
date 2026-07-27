// ============================================================================
// Vị trí + danh tính cơ bản của 1 trạm phao — data đủ để FE vẽ marker trên bản
// đồ. Do bot (soosky-bot-weather-marine) crawl ghi vào collection "buoys";
// API này ĐỌC lại (+ lazy seed khi thiếu). KHÔNG chứa weather.
// ============================================================================

export interface BuoyStation {
    buoyId: string;
    name: string | null;
    lat: number;
    lon: number;
}

