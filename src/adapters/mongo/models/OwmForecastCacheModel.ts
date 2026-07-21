import {Schema, model} from 'mongoose'
import {HourlyForecastPoint, DailyForecastPoint} from '../../../domain/entities/OwmForecast'

const hourlySchema = new Schema<HourlyForecastPoint>({
    time:        {type: String, required: true},
    temperature: {type: Number, default: null},
    windSpeed:   {type: Number, default: null},
    pop:         {type: Number, default: null},
    description: {type: String, default: null}
}, {_id: false})

const dailySchema = new Schema<DailyForecastPoint>({
    date:        {type: String, required: true},
    tempMin:     {type: Number, default: null},
    tempMax:     {type: Number, default: null},
    windSpeed:   {type: Number, default: null},
    pop:         {type: Number, default: null},
    description: {type: String, default: null}
}, {_id: false})

export interface OwmForecastCacheDoc {
    lat: number;
    lon: number;
    hourly: HourlyForecastPoint[];
    daily: DailyForecastPoint[];
    updatedAt?: Date;   //do {timestamps: true} sinh ra
}

const schema = new Schema<OwmForecastCacheDoc>({
    lat:    {type: Number, required: true},
    lon:    {type: Number, required: true},
    hourly: {type: [hourlySchema], default: []},
    daily:  {type: [dailySchema], default: []}
}, {timestamps: true})

schema.index({lat: 1, lon: 1}, {unique: true})

export default model<OwmForecastCacheDoc>('OwmForecastCache', schema)
