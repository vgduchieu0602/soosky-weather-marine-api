import BuoyWeatherRepository from "../../domain/repositories/IBuoyWeatherRepository";
import {BuoyWeather, BuoyQuery} from "../../domain/entities/BuoyWeather";
import BuoyWeatherCacheModel from "./models/BuoyWeatherCacheModel";

export default class MongoBuoyWeatherRepository implements BuoyWeatherRepository {
    constructor (
        private _inner: BuoyWeatherRepository, //NdbcBuoyRepository cũ, dùng khi cần refetch\
        private _ttlMs: number
    ) {}

    public async getBuoyWeather (query: BuoyQuery): Promise<BuoyWeather> {
        const doc = await BuoyWeatherCacheModel.findOne({
            buoyId: query.buoyId
        }).lean();

        if (doc && this._isFresh(doc.updatedAt)) {
            return {
                buoyId: doc.buoyId,
                windDirection: doc.windDirection,
                windSpeed: doc.windSpeed,
                gust: doc.gust,
                waveHeight: doc.waveHeight,
                atmospherePressure: doc.atmospherePressure,
                temperature: doc.temperature,
                waterTemp: doc.waterTemp,
                visibility: doc.visibility,
                updatedAt: doc.updatedAt,
            }
        }

        //Trông hoặc hết hạn: gọi NDBC ghi đè Mongo trả kết quả mới
        const fresh = await this._inner.getBuoyWeather(query)

        await BuoyWeatherCacheModel.findOneAndUpdate(
            {buoyId: query.buoyId},
            {$set: fresh},
            {upsert: true}
        )

        return fresh
    }

    private _isFresh (updatedAt: string): boolean {
        const ageMs = Date.now() - new Date(updatedAt).getTime();
        return ageMs < this._ttlMs;
    }
}