import { MapTile, MapLayer } from "../entities/MapTile";

// Query = input truyền vào (không phải data lưu trữ) -> khai ở port.
export type MapTileQuery = {
    layer: MapLayer;
    z: number;
    x: number;
    y: number;
};

export default interface MapTileRepository {
    getTile(query: MapTileQuery): Promise<MapTile>;
}
