export const MAP_LAYERS = ['windSpeed', 'temperature', 'pressure'] as const;

export type MapLayer = (typeof MAP_LAYERS)[number];

export type MapTileQuery = {
    layer: MapLayer;
    z: number;
    x: number;
    y: number;
};

export interface MapTile {
    buffer: Buffer; // bytes ảnh PNG thô — Server sẽ res.send() thẳng, không qua JSON
    contentType: string; // "image/png"
}
