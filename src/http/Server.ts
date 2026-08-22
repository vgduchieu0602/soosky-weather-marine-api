// ============================================================================
// Server.ts — tầng HTTP (Express). Đây là NƠI DUY NHẤT project biết "request",
// "response", "route" là gì. Việc của tầng này CHỈ có 3 thứ:
//   1. Đọc input từ request (params/query) + validate hình thức (đủ/đúng kiểu)
//   2. Gọi use-case tương ứng (không tự xử lý nghiệp vụ ở đây)
//   3. Trả JSON theo đúng format {ok, data} hoặc {ok:false, reason}
// Đọc file này SAU KHI đã hiểu domain/ (entity, use-case) — Server chỉ là lớp
// vỏ bọc HTTP quanh use-case, không chứa business logic.
// ============================================================================

import express, {NextFunction, Request, Response} from 'express'
import ClientError from './ClientError'
import NoTideDataError from '../domain/errors/NoTideDataError'
import StationNotFoundError from '../domain/errors/StationNotFoundError'
import UpstreamUnavailableError from '../domain/errors/UpstreamUnavailableError'
import { formatResponseData } from './formatResponseData'
import GetTideChartUseCase from '../domain/use-cases/tide/getTideChartUseCase';
import GetBuoyWeatherDetailUseCase from '../domain/use-cases/buoy/GetBuoyWeatherDetailUseCase';
import ListBuoysUseCase from '../domain/use-cases/buoy/ListBuoysUseCase';
import GetPointWeatherDetailUseCase from '../domain/use-cases/weather/GetPointWeatherDetailUseCase';
import GetMapTileUseCase from '../domain/use-cases/map/GetMapTileUseCase';
import GetRadarUseCase from '../domain/use-cases/radar/GetRadarUseCase';
import GetAlertsUseCase from '../domain/use-cases/alert/GetAlertsUseCase';
import GetWeatherTipsUseCase from '../domain/use-cases/tips/GetWeatherTipsUseCase';
import { MAP_LAYERS, MapLayer } from '../domain/entities/MapTile';
import { PERSONAS, Persona, validateWeatherTipsWeather } from '../domain/entities/WeatherTips';
import { getResponseMeta, runWithResponseTrace } from '../observability/responseTrace';

export {Server as default}

/*----------------------------------------------------------------------------------------*/

const HTTP_DEFAULT_PORT = 3002;
const HTTP_DEFAULT_HOST = "127.0.0.1";

// Station id NOAA CO-OPS luôn là 7 chữ số. Chặn tại đây để id rác (chữ, ký tự
// đặc biệt) trả 400 thay vì đi 1 vòng NOAA rồi về 404 với message của họ.
const NOAA_STATION_ID = /^\d{7}$/;

// Trần 'days'. NOAA cho tới 1 năm/lần nhưng days=365 trả ~560KB, và MỖI giá trị
// days sinh 1 document cache riêng (xem MongoTideCache) + 2 call NOAA -> để mở
// là vừa tốn quota vừa phình cache. 7 ngày đủ cho biểu đồ tide của FE.
const MAX_TIDE_DAYS = 7;

// Dải zoom map của FE: 3 (nhìn cả vùng biển) tới 12 (chi tiết ven bờ). Với tile
// Web Mercator ở zoom z, x/y luôn là số nguyên trong [0, 2^z - 1]; chặn trước
// khi gọi OWM để input client sai trả 400 thay vì biến thành lỗi upstream 502.
const MIN_MAP_ZOOM = 3;
const MAX_MAP_ZOOM = 12;

/*----------------------------------------------------------------------------------------*/

// Type mô tả object `useCases` mà `app.ts` sẽ truyền vào — nhóm theo domain
// (tide/buoy) giống hệt cấu trúc object thật được tạo trong app.ts. Đây KHÔNG
// phải interface tự adapter gọi ra ngoài — chỉ là "kiểu tham số" cho
// constructor Server bên dưới.
type ServerUseCases = {
    tide: {
        getTideChart: GetTideChartUseCase;
    }
    buoy: {
        getBuoyWeatherDetail: GetBuoyWeatherDetailUseCase;
        listBuoys: ListBuoysUseCase;
    }
    weather: {
        getPointWeatherDetail: GetPointWeatherDetailUseCase;
    }
    map: {
        getMapTile: GetMapTileUseCase;
    }
    radar: {
        getRadar: GetRadarUseCase;
    }
    alert: {
        getAlerts: GetAlertsUseCase;
    }
    tips: {
        getWeatherTips: GetWeatherTipsUseCase;
    }
}

/*----------------------------------------------------------------------------------------*/

class Server {
    constructor (
        private _useCases: ServerUseCases,
        private _mapTilesEnabled = false
    ) {
        this._registerRouter();
        this._registerErrorHandler();
    }

    private readonly _server = express();

    private _sendJson (res: Response, data: unknown) {
        return res.json({
            ok: true,
            data: formatResponseData(data),
            meta: getResponseMeta()
        })
    }

    private readonly routes = [
        ['GET', '/',
            this._GET_index.bind(this),
        ],
        ['GET', '/health',
            this._GET_health.bind(this),
        ],
        ['GET', '/api/v1/tides',
            this._GET_tides.bind(this)
        ],
        ['GET', '/api/v1/buoys',
            this._GET_buoys.bind(this)
        ],
        ['GET', '/api/v1/buoys/:buoyId/weather',
            this._GET_buoyWeather.bind(this)
        ],
        ['GET', '/api/v1/weather',
            this._GET_pointWeather.bind(this)
        ],
        ['GET', '/api/v1/maps/:layer/:z/:x/:y',
            this._GET_mapTile.bind(this)
        ],
        ['GET', '/api/v1/radar',
            this._GET_radar.bind(this)
        ],
        ['GET', '/api/v1/alerts',
            this._GET_alerts.bind(this)
        ],
        ['POST', '/api/v1/weather-tips',
            this._POST_weatherTips.bind(this)
        ]
    ]

    private _registerRouter(): void {
        this._server.set('trust proxy', 1)

        this._server.use(express.json({limit: '64kb'}))

        this._server.use((_req: Request, _res: Response, next: NextFunction) => {
            runWithResponseTrace(() => next())
        })

        for (const [method, path, ...handlers] of this.routes) {
            (this._server as any)[(method as string).toLowerCase()](path, ...handlers)
        }

        this._server.use(() => {
            throw new ClientError('Not Found.', 404, 'NOT_FOUND')
        });
    }

    private _registerErrorHandler(): void {
        this._server.use((err:any, req: Request, res: Response, next: NextFunction) => {
            let statusCode: number;
            let message: string;
            let code: string;

            switch (true) {
                case (err instanceof ClientError):
                    statusCode = err.statusCode;
                    message = err.message;
                    code = err.code;
                    break;
                case (err instanceof StationNotFoundError):
                    // Trạm không tồn tại -> 404. Đặt TRƯỚC NoTideDataError case cho rõ
                    // ý; hai class không kế thừa nhau nên thứ tự không bắt buộc.
                    statusCode = 404;
                    message = err.message;
                    code = 'STATION_NOT_FOUND';
                    break;
                case (err instanceof NoTideDataError):
                    // Trạm CÓ thật nhưng không có tide prediction (Great Lakes,
                    // water-level-only) -> lỗi input, không phải 500.
                    statusCode = 422;
                    message = err.message;
                    code = 'NO_TIDE_DATA';
                    break;
                case (err instanceof UpstreamUnavailableError):
                    // Nguồn ngoài (NOAA) trục trặc tạm thời.
                    statusCode = 502;
                    message = 'Upstream service unavailable.';
                    code = 'UPSTREAM_UNAVAILABLE';
                    console.warn(`[502] ${req.method} ${req.originalUrl} -> ${err.message}`);
                    break;
                default:
                    statusCode = 500;
                    message = "Internal Server Error";
                    code = 'INTERNAL';
                    console.error(`[500] ${req.method} ${req.originalUrl} ->`, err.stack || err)
            }

            res.status(statusCode).json({
                ok: false,
                code,
                reason: message,
                meta: getResponseMeta()
            });

            next()
        })
    }

    private _GET_index(_req: Request, res: Response):any {
        return res.json({ message: 'Hello, World! This is Weather Marine API.' })
    }

    private _GET_health(_req: Request, res: Response):any {
        return this._sendJson(res, { uptime: process.uptime() })
    }

    private async _GET_tides (req: Request, res: Response) {
        const stationId = req.query.stationId as string;
        const daysRaw = req.query.days as string | undefined;

        if (!stationId) throw new ClientError("Query param 'stationId' is required." );
        if (!NOAA_STATION_ID.test(stationId)) throw new ClientError("'stationId' must be a 7-digit NOAA station id.");

        // date luôn = HÔM NAY (UTC), backend tự set — FE không cần truyền. Tide chart
        // luôn hiển thị ngày hiện tại; dữ liệu trả về theo giờ để FE vẽ curve.
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        let days: number | undefined;

        if (daysRaw !== undefined) {
            // parseInt nuốt phần rác ("1.9" -> 1, "2abc" -> 2) nên nhận âm thầm giá
            // trị sai kiểu -> ép cả chuỗi phải là chữ số trước khi parse.
            if (!/^\d+$/.test(daysRaw)) {
                throw new ClientError("'days' must be a positive integer.");
            }
            days = parseInt(daysRaw, 10);
            if (days < 1 || days > MAX_TIDE_DAYS) {
                throw new ClientError(`'days' must be between 1 and ${MAX_TIDE_DAYS}.`);
            }
        }

        const data = await this._useCases.tide.getTideChart.execute({stationId, date, days})

        return this._sendJson(res, data)
    }

    private async _GET_buoys (_req: Request, res: Response) {
        // Danh sách buoy (vị trí + tên) cho FE vẽ marker trên bản đồ. Đọc từ DB
        // (bot crawl); DB rỗng -> fallback NDBC + seed nền.
        const data = await this._useCases.buoy.listBuoys.execute()

        return this._sendJson(res, data)
    }

    private async _GET_buoyWeather (req: Request, res: Response) {
        const buoyId = req.params.buoyId as string;
        const latRaw = req.query.lat as string;
        const lonRaw = req.query.lon as string;
        const tideStationId = req.query.tideStationId as string | undefined;

        if (!buoyId) throw new ClientError("Path param 'buoyId' is required.")
        if (!latRaw || !lonRaw) throw new ClientError("Query params 'lat' and 'lon' are required.")

        const lat = parseFloat(latRaw);
        const lon = parseFloat(lonRaw);

        if (isNaN(lat) || lat < -90 || lat > 90) throw new ClientError("'lat' must be between -90 and 90.")
        if (isNaN(lon) || lon < -180 || lon > 180) throw new ClientError("'lon' must be between -180 and 180.")

        const data = await this._useCases.buoy.getBuoyWeatherDetail.execute({buoyId, lat, lon, tideStationId})

        return this._sendJson(res, data)
    }

    private async _GET_pointWeather (req: Request, res: Response) {
        const latRaw = req.query.lat as string;
        const lonRaw = req.query.lon as string;
        const tideStationId = req.query.tideStationId as string | undefined;

        if (!latRaw || !lonRaw) throw new ClientError("Query params 'lat' and 'lon' are required.")

        const lat = parseFloat(latRaw);
        const lon = parseFloat(lonRaw);

        if (isNaN(lat) || lat < -90 || lat > 90) throw new ClientError("'lat' must be between -90 and 90.")
        if (isNaN(lon) || lon < -180 || lon > 180) throw new ClientError("'lon' must be between -180 and 180.")

        const data = await this._useCases.weather.getPointWeatherDetail.execute({lat, lon, tideStationId})

        return this._sendJson(res, data)
    }

    private async _GET_mapTile (req: Request, res: Response) {
        if (!this._mapTilesEnabled) {
            throw new ClientError('Map tiles are temporarily disabled.', 503, 'MAP_TILES_DISABLED')
        }

        const layer = req.params.layer as string;
        const z = parseMapCoordinate(req.params.z as string);
        const x = parseMapCoordinate(req.params.x as string);
        const y = parseMapCoordinate(req.params.y as string);

        if (!(MAP_LAYERS as readonly string[]).includes(layer)) {
            throw new ClientError(`'layer' must be one of: ${MAP_LAYERS.join(', ')}`)
        }
        if (z === null || x === null || y === null) {
            throw new ClientError("'z', 'x', and 'y' must be integers.")
        }
        if (z < MIN_MAP_ZOOM || z > MAX_MAP_ZOOM) {
            throw new ClientError(`'z' must be between ${MIN_MAP_ZOOM} and ${MAX_MAP_ZOOM}.`)
        }

        const maxTileCoordinate = (2 ** z) - 1
        if (x < 0 || x > maxTileCoordinate || y < 0 || y > maxTileCoordinate) {
            throw new ClientError(`'x' and 'y' must be between 0 and ${maxTileCoordinate} for zoom ${z}.`)
        }

        // Tile ảnh nhị phân — không có "trạng thái rỗng" hợp lý -> upstream (OWM)
        // lỗi thì 502, không phải 500.
        let tile;
        try {
            tile = await this._useCases.map.getMapTile.execute({layer: layer as MapLayer, z, x, y})
        } catch (err) {
            throw new UpstreamUnavailableError(`map tile upstream failed: ${(err as Error)?.message ?? err}`)
        }

        res.set('Content-Type', tile.contentType)
        return res.send(tile.buffer)
    }

    private async _GET_radar (req: Request, res: Response) {
        const latRaw = req.query.lat as string;
        const lonRaw = req.query.lon as string;

        if (!latRaw || !lonRaw) throw new ClientError("Query params 'lat' and 'lon' are required.")

        const lat = parseFloat(latRaw);
        const lon = parseFloat(lonRaw);

        if (isNaN(lat) || lat < -90 || lat > 90) throw new ClientError("'lat' must be between -90 and 90.")
        if (isNaN(lon) || lon < -180 || lon > 180) throw new ClientError("'lon' must be between -180 and 180.")

        const data = await this._useCases.radar.getRadar.execute({lat, lon})

        return this._sendJson(res, data)
    }

    private async _GET_alerts (req: Request, res: Response) {
        const latRaw = req.query.lat as string;
        const lonRaw = req.query.lon as string;

        if (!latRaw || !lonRaw) throw new ClientError("Query params 'lat' and 'lon' are required.")

        const lat = parseFloat(latRaw);
        const lon = parseFloat(lonRaw);

        if (isNaN(lat) || lat < -90 || lat > 90) throw new ClientError("'lat' must be between -90 and 90.")
        if (isNaN(lon) || lon < -180 || lon > 180) throw new ClientError("'lon' must be between -180 and 180.")

        const data = await this._useCases.alert.getAlerts.execute({lat, lon})

        return this._sendJson(res, data)
    }

    // Smart Weather Tips. Body: { persona, weather }. Validate persona thuộc enum
    // + weather là object. Chi tiết field weather để Gemini xử lý (bỏ tip khi null).
    private async _POST_weatherTips (req: Request, res: Response) {
        const body = req.body ?? {};
        const persona = body.persona as string;
        const weather = body.weather;

        if (!persona) throw new ClientError("Body field 'persona' is required.")
        if (!(PERSONAS as readonly string[]).includes(persona)) {
            throw new ClientError(`'persona' must be one of: ${PERSONAS.join(', ')}`)
        }
        const weatherValidationError = validateWeatherTipsWeather(weather)
        if (weatherValidationError) throw new ClientError(weatherValidationError)

        // Gemini lỗi/quota/safety-block -> 502, không phải 500.
        let data;
        try {
            data = await this._useCases.tips.getWeatherTips.execute({
                persona: persona as Persona,
                weather
            })
        } catch (err) {
            throw new UpstreamUnavailableError(`weather tips upstream failed: ${(err as Error)?.message ?? err}`)
        }

        return this._sendJson(res, data)
    }

    public listen(port?: number, hostname?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this._server.listen(
                port || HTTP_DEFAULT_PORT,
                hostname || HTTP_DEFAULT_HOST,
                (err?: Error) => err ? reject(err) : resolve()
            )
        })
    }
}

function parseMapCoordinate (value: string): number | null {
    if (!/^-?\d+$/.test(value)) return null

    const coordinate = Number(value)
    return Number.isSafeInteger(coordinate) ? coordinate : null
}
