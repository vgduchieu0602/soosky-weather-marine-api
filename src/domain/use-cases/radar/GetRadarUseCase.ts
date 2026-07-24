import RadarRepository from "../../repositories/IRadarRepository";
import { RadarInfo } from "../../entities/RadarInfo";

// Query = input FE truyền (toạ độ vị trí user). Frame RainViewer là TOÀN CẦU
// (không lọc theo toạ độ), nhưng FE cần lat/lon để căn/hiển thị tile đúng vị trí
// -> nhận vào + echo lại trong response cho FE tiện dùng.
export type RadarQuery = {
    lat: number;
    lon: number;
}

export interface RadarView extends RadarInfo {
    lat: number;
    lon: number;
}

export default class GetRadarUseCase {
    constructor(private _radarRepo: RadarRepository) {}

    public async execute(query: RadarQuery): Promise<RadarView> {
        try {
            const info = await this._radarRepo.getRadarInfo();
            return { ...info, lat: query.lat, lon: query.lon };
        } catch (err) {
            // Upstream (RainViewer) lỗi & không có cache -> degrade rỗng (200) thay
            // vì 500. FE hiển thị "không có dữ liệu radar" thay vì màn hình lỗi.
            console.warn(`[radar] upstream lỗi -> degrade rỗng: ${(err as Error)?.message ?? err}`);
            return {
                host: '',
                past: [],
                nowcast: [],
                generatedAt: new Date().toISOString(),
                lat: query.lat,
                lon: query.lon
            };
        }
    }
}
