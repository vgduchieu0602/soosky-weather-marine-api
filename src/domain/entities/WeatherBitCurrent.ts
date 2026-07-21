// ==================================================================================
// Dữ liệu uvIndex + humidity lấy từ WeatherBit (theo toạ độ, KHÔNG theo trạm buoy).
// ==================================================================================

export type WeatherBitQuery = {
    lat:number;
    lon: number
}

export interface WeatherBitCurrent {
    lat: number;
    lon: number;
    uvIndex: number | null;  // 0-11+, nullable vì WeatherBit có thể thiếu data tuỳ trạm nguồn
    humidity: number | null; // %, nullable cùng lý do
    updatedAt: string;  //ISO UTC
}
