import MapTileRepository from "../../repositories/IMapTileRepository";
import { MapTile, MapTileQuery } from "../../entities/MapTile";

export default class GetMapTileUseCase {
    constructor(private _mapTileRepo: MapTileRepository) {}

    public execute(query: MapTileQuery): Promise<MapTile> {
        return this._mapTileRepo.getTile(query);
    }
}
