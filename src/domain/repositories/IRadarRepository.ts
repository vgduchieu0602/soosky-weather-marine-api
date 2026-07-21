import { RadarInfo } from "../entities/RadarInfo";

export default interface RadarRepository {
    getRadarInfo(): Promise<RadarInfo>;
}
