export type WeatherBitQuery = { 
    lat:number; 
    lon: number
}

export interface WeatherBitCurrent {
    lat: number;
    lon: number;
    uvIndex: number | null;
    humidity: number | null;
    updatedAt: string;  //ISO UTC
}


