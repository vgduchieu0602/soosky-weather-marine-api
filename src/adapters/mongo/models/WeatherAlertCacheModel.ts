import {Schema, model} from 'mongoose'
import {WeatherAlert} from '../../../domain/entities/WeatherAlert'

const alertSchema = new Schema<WeatherAlert>({
    title:      {type: String, default: ''},
    severity:   {type: String, default: null},
    regions:    {type: [String], default: []},
    onsetLocal: {type: String, default: null},
    endsLocal:  {type: String, default: null}
}, {_id: false})

export interface WeatherAlertCacheDoc {
    lat: number;
    lon: number;
    alerts: WeatherAlert[];
    updatedAt?: Date;   //do {timestamps: true} sinh ra
}

const schema = new Schema<WeatherAlertCacheDoc>({
    lat:    {type: Number, required: true},
    lon:    {type: Number, required: true},
    alerts: {type: [alertSchema], default: []}
}, {timestamps: true})

schema.index({lat: 1, lon: 1}, {unique: true})

export default model<WeatherAlertCacheDoc>('WeatherAlertCache', schema)
