import {Schema, model} from 'mongoose'

export interface WeatherBitCacheDoc {
    lat: number;
    lon: number;
    humidity: number | null;
    dewPoint: number | null;
    humidityUpdatedAt: string;  //ISO UTC — lúc humidity/dewPoint được lấy gần nhất
    uvIndex: number | null;
    uvUpdatedAt: string;        //ISO UTC — lúc uvIndex được lấy gần nhất
}

const schema = new Schema<WeatherBitCacheDoc>({
    lat:               {type: Number, required: true},
    lon:               {type: Number, required: true},
    humidity:          {type: Number, default: null},
    dewPoint:          {type: Number, default: null},
    humidityUpdatedAt: {type: String, default: null},
    uvIndex:           {type: Number, default: null},
    uvUpdatedAt:       {type: String, default: null}
})

schema.index({lat: 1, lon: 1}, {unique: true})

export default model<WeatherBitCacheDoc>('WeatherBitCache', schema)
