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

export interface TideChart {
    stationId: string;

    predictions: TidePoint[]; 
    highLow: TideExtreme[];
}
