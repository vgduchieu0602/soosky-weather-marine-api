// ============================================================================
// Dữ liệu "dự báo thuỷ triều" theo 1 trạm NOAA.
// ============================================================================

export interface TidePoint {
    time: string; //ISO 8601 UTC
    height: number; //meters (SI) — độ cao mực nước tại thời điểm `time`
}

// 1 mốc đỉnh/chân triều (nước lớn nhất / ròng nhất trong ngày).
export interface TideExtreme {
    time: string;
    height: number;
    type: 'H' | 'L';    //H = nước lớn (High), L = nước ròng (Low)
}

/*---------------------------------------------------------------------------------------------*/

export type TideQuery = {
    stationId: string;
    date: string; //"YYYYMMDD" — bắt buộc đúng format này (Server.ts có validate bằng regex)
    days?: number;  //mặc định 1 — dấu `?` nghĩa là field optional, có thể không truyền
    datum?: string; //mặc định "MLLW" (mực nước chuẩn dùng để tính độ cao)
}

/*---------------------------------------------------------------------------------------------*/

export interface TideChart {
    stationId: string;

    predictions: TidePoint[]; 
    highLow: TideExtreme[];
}
