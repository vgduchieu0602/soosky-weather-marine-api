import {Schema, model} from 'mongoose'

export interface WeatherBitCacheDoc {
    lat: number;
    lon: number;
    fetchedAt: string | null;
    temperature: number | null;
    humidity: number | null;
    dewPoint: number | null;
    humidityUpdatedAt: string;  //ISO UTC — lúc WeatherBit ĐO humidity/dewPoint
    uvIndex: number | null;
    uvUpdatedAt: string;        //ISO UTC — lúc WeatherBit ĐO uvIndex
    humidityCachedAt: string | null; //ISO UTC — lúc GHI cache humidity (so TTL)
    uvCachedAt: string | null;       //ISO UTC — lúc GHI cache uvIndex (so TTL)
}

const schema = new Schema<WeatherBitCacheDoc>({
    lat:               {type: Number, required: true},
    lon:               {type: Number, required: true},
    fetchedAt:         {type: String, default: null},
    temperature:       {type: Number, default: null},
    humidity:          {type: Number, default: null},
    dewPoint:          {type: Number, default: null},
    humidityUpdatedAt: {type: String, default: null},
    uvIndex:           {type: Number, default: null},
    uvUpdatedAt:       {type: String, default: null},
    humidityCachedAt:  {type: String, default: null},
    uvCachedAt:        {type: String, default: null}
})

schema.index({lat: 1, lon: 1}, {unique: true})

export default model<WeatherBitCacheDoc>('WeatherBitCache', schema)
