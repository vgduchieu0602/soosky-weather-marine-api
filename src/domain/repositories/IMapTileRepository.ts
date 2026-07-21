import { MapTile, MapTileQuery } from "../entities/MapTile";

export default interface MapTileRepository {
    getTile(query: MapTileQuery): Promise<MapTile>;
}
