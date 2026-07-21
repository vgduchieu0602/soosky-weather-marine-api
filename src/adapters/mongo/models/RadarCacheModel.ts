import {Schema, model} from 'mongoose'
import {RadarFrame} from '../../../domain/entities/RadarInfo'

const frameSchema = new Schema<RadarFrame>({
    time: {type: Number, required: true},
    path: {type: String, required: true}
}, {_id: false})

export interface RadarCacheDoc {
    key: string;    //luôn 'radar' — chỉ để có khoá unique cho 1 document duy nhất
    host: string;
    past: RadarFrame[];
    nowcast: RadarFrame[];
    generatedAt: string;
    updatedAt?: Date;   //do {timestamps: true} sinh ra
}

const schema = new Schema<RadarCacheDoc>({
    key:         {type: String, required: true, unique: true},
    host:        {type: String, default: ''},
    past:        {type: [frameSchema], default: []},
    nowcast:     {type: [frameSchema], default: []},
    generatedAt: {type: String, required: true}
}, {timestamps: true})

export default model<RadarCacheDoc>('RadarCache', schema)
