// ============================================================================
// ITideRepository.ts — port cho dữ liệu thuỷ triều. Có 2 implementation:
// NoaaTidesRepository (gọi thẳng NOAA) và CachedTideRepository (cache-aside).
// ============================================================================

import { TideChart } from "../entities/TideChart";

// Query = INPUT do client/use-case truyền vào, KHÔNG phải dữ liệu backend lưu
// trữ -> khai ở port này (nơi dùng), không nằm trong entity.
export type TideQuery = {
    stationId: string;
    date: string;   //"YYYYMMDD" — Server.ts validate bằng regex
    days?: number;  //mặc định 1
    datum?: string; //mặc định "MLLW" (mực nước chuẩn để tính độ cao)
};

export default interface TideRepository {
    getTideChart(query: TideQuery): Promise<TideChart>;
}
