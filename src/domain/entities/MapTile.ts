export const MAP_LAYERS = ['windSpeed', 'temperature', 'pressure'] as const;

export type MapLayer = (typeof MAP_LAYERS)[number];

export interface MapTile {
    buffer: Buffer; // bytes ảnh PNG thô — Server sẽ res.send() thẳng, không qua JSON
    contentType: string; // "image/png"
}
