import {Schema, model} from 'mongoose'

export interface BuoyWeatherCacheDoc {
    buoyId: string;
    windDirection: number | null;
    windSpeed: number | null;
    gust: number | null;
    waveHeight: number | null;
    atmospherePressure: number | null;
    temperature: number | null;
    waterTemp: number | null;
    visibility: number | null;
    updatedAt: string;
}

const schema = new Schema<BuoyWeatherCacheDoc> ({
    buoyId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    windDirection: {
        type: Number,
        default: null
    },
    windSpeed: {
        type: Number,
        default: null
    },
    gust: {
        type: Number,
        default: null
    },
    waveHeight: {
        type: Number,
        default: null
    },
    atmospherePressure: {
        type: Number,
        default: null
    },
    temperature: {
        type: Number,
        default: null
    },
    waterTemp: {
        type: Number,
        default: null
    },
    visibility: {
        type: Number,
        default: null
    },
    updatedAt: {
        type: String,
        required: true
    }
})

export default model<BuoyWeatherCacheDoc>('BuoyWeatherCache', schema)