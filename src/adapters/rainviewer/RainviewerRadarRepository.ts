import RadarRepository from "../../domain/repositories/IRadarRepository";
import { RadarInfo, RadarFrame } from "../../domain/entities/RadarInfo";

const RAINVIEWER_URL = 'https://api.rainviewer.com/public/weather-maps.json';

export default class RainviewerRadarRepository implements RadarRepository {
    public async getRadarInfo(): Promise<RadarInfo> {
        const resp = await fetch(RAINVIEWER_URL);

        if (!resp.ok) {
            throw new Error(`RainViewer request failed: HTTP ${resp.status}`);
        }

        const json: any = await resp.json();

        return {
            host: json.host,
            past: this._mapFrames(json.radar?.past),
            nowcast: this._mapFrames(json.radar?.nowcast),
            generatedAt: new Date().toISOString(),
        };
    }

    private _mapFrames(frames: any[] | undefined): RadarFrame[] {
        return (frames ?? []).map((f) => ({
            time: f.time,
            path: f.path,
        }));
    }
}
