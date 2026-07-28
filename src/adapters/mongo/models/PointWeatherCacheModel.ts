import {Schema, model} from 'mongoose'

export interface PointWeatherCacheDoc {
    lat: number;
    lon: number;
    conditionCode: string | null;
    conditionMain: string | null;
    description: string | null;
    icon: string | null;
    windDirection: number | null;
    windSpeed: number | null;
    gust: number | null;
    waveHeight: number | null;
    atmospherePressure: number | null;
    temperature: number | null;
    waterTemp: number | null;
    visibility: number | null;
    owmUpdatedAt: string;   //thời điểm OWM đo
    updatedAt?: Date;       //do {timestamps: true} sinh — thời điểm ghi cache
}

const schema = new Schema<PointWeatherCacheDoc>({
    lat:                {type: Number, required: true},
    lon:                {type: Number, required: true},
    conditionCode:      {type: String, default: null},
    conditionMain:      {type: String, default: null},
    description:        {type: String, default: null},
    icon:               {type: String, default: null},
    windDirection:      {type: Number, default: null},
    windSpeed:          {type: Number, default: null},
    gust:               {type: Number, default: null},
    waveHeight:         {type: Number, default: null},
    atmospherePressure: {type: Number, default: null},
    temperature:        {type: Number, default: null},
    waterTemp:          {type: Number, default: null},
    visibility:         {type: Number, default: null},
    owmUpdatedAt:       {type: String, required: true}
}, {timestamps: true})

schema.index({lat: 1, lon: 1}, {unique: true})

export default model<PointWeatherCacheDoc>('PointWeatherCache', schema)
