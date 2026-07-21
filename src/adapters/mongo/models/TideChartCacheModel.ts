import {Schema, model} from 'mongoose'
import {TidePoint, TideExtreme} from '../../../domain/entities/TideChart'

const tidePointSchema = new Schema<TidePoint>({
    time:   {type: String, required: true},
    height: {type: Number, required: true}
}, {_id: false})

const tideExtremeSchema = new Schema<TideExtreme>({
    time:   {type: String, required: true},
    height: {type: Number, required: true},
    type:   {type: String, enum: ['H', 'L'], required: true}
}, {_id: false})

export interface TideChartCacheDoc {
    stationId: string;
    date: string;   //"YYYYMMDD"
    days: number;   //đã normalize (mặc định 1) trước khi ghi
    datum: string;  //đã normalize (mặc định "MLLW") trước khi ghi
    predictions: TidePoint[];
    highLow: TideExtreme[];
    updatedAt?: Date;   //do {timestamps: true} sinh ra
}

const schema = new Schema<TideChartCacheDoc>({
    stationId:   {type: String, required: true},
    date:        {type: String, required: true},
    days:        {type: Number, required: true},
    datum:       {type: String, required: true},
    predictions: {type: [tidePointSchema], default: []},
    highLow:     {type: [tideExtremeSchema], default: []}
}, {timestamps: true})

schema.index({stationId: 1, date: 1, days: 1, datum: 1}, {unique: true})

export default model<TideChartCacheDoc>('TideChartCache', schema)
