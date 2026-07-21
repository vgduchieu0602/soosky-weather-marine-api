import config from '../../config'
import MapTileRepository from '../../domain/repositories/IMapTileRepository';
import { MapTile, MapTileQuery, MapLayer } from '../../domain/entities/MapTile';

const OWM_TILE_BASE = 'https://tile.openweathermap.org/map';

// Tên layer FE dùng (dễ hiểu) -> tên layer thật OWM Weather Maps 1.0 yêu cầu.
const LAYER_CODE: Record<MapLayer, string> = {
    windSpeed: 'wind_new',
    temperature: 'temp_new',
    pressure: 'pressure_new',
};

export default class OwmMapTileRepository implements MapTileRepository {
    public async getTile(query: MapTileQuery): Promise<MapTile> {
        const layerCode = LAYER_CODE[query.layer];
        const url = `${OWM_TILE_BASE}/${layerCode}/${query.z}/${query.x}/${query.y}.png?appid=${config.owm.apiKey}`;

        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`OWM map tile request failed: HTTP ${resp.status}`);
        }

        const arrayBuffer = await resp.arrayBuffer();

        return {
            buffer: Buffer.from(arrayBuffer),
            contentType: resp.headers.get('content-type') ?? 'image/png',
        };
    }
}
