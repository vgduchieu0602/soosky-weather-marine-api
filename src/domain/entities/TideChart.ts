export interface TidePoint {
    time: string; //ISO 8601 UTC
    height: number; //meters (SI)
}

export interface TideExtreme {
    time: string;
    height: number;
    type: 'H' | 'L';    //H = nước lớn, L = nước ròng
}

/*---------------------------------------------------------------------------------------------*/

export type TideQuery = {
    stationId: string;
    date: string; //"YYYYMMDD"
    days?: number;  //mặc định 1
    datum?: string; //mặc định "MLLW"
}

/*---------------------------------------------------------------------------------------------*/

export interface TideChart {
    stationId: string;

    predictions: TidePoint[];
    highLow: TideExtreme[];
}
