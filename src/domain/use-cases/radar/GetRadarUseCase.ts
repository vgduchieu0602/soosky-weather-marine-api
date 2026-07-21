import RadarRepository from "../../repositories/IRadarRepository";
import { RadarInfo } from "../../entities/RadarInfo";

export default class GetRadarUseCase {
    constructor(private _radarRepo: RadarRepository) {}

    public execute(): Promise<RadarInfo> {
        return this._radarRepo.getRadarInfo();
    }
}
