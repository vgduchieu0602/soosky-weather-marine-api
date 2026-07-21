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

        
        if (doc && this._isFresh(doc.cachedAt)) {
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

        //Trống hoặc hết hạn: gọi NDBC ghi đè Mongo trả kết quả mới
        const fresh = await this._inner.getBuoyWeather(query)

        // `findOneAndUpdate(điều_kiện, {$set: fresh}, {upsert: true})`:
        //  - Nếu đã có document khớp `buoyId` -> cập nhật ("$set" = ghi đè
        //    đúng các field trong `fresh", không đụng field khác nếu có).
        //  - Nếu CHƯA có -> `upsert: true` bảo Mongo tự TẠO MỚI document đó
        //    luôn (upsert = update-or-insert). Đây là lý do collection không
        //    bao giờ phình: luôn ghi đè cùng 1 document/buoyId, không insert thêm.
        await BuoyWeatherCacheModel.findOneAndUpdate(
            {buoyId: query.buoyId},
            {$set: fresh},
            {upsert: true}
        )

        return fresh
    }

    private _isFresh (cachedAt?: Date): boolean {
        if (!cachedAt) return false
        const ageMs = Date.now() - new Date(cachedAt).getTime();
        return ageMs < this._ttlMs;
    }
}