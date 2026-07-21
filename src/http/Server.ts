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
import GetTideChartUseCase from '../domain/use-cases/tide/getTideChartUseCase';
import GetBuoyWeatherDetailUseCase from '../domain/use-cases/buoy/GetBuoyWeatherDetailUseCase';
import GetPointWeatherDetailUseCase from '../domain/use-cases/weather/GetPointWeatherDetailUseCase';
import GetMapTileUseCase from '../domain/use-cases/map/GetMapTileUseCase';
import GetRadarUseCase from '../domain/use-cases/radar/GetRadarUseCase';
import GetAlertsUseCase from '../domain/use-cases/alert/GetAlertsUseCase';
import GetWeatherTipsUseCase from '../domain/use-cases/tips/GetWeatherTipsUseCase';
import { MAP_LAYERS, MapLayer } from '../domain/entities/MapTile';
import { PERSONAS, Persona } from '../domain/entities/WeatherTips';
import GlobalRateLimiter from './GlobalRateLimiter';

export {Server as default}

/*----------------------------------------------------------------------------------------*/

const HTTP_DEFAULT_PORT = 3002;
const HTTP_DEFAULT_HOST = "0.0.0.0";

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
        private _rateLimiter: GlobalRateLimiter
    ) {
        this._registerRouter();
        this._registerErrorHandler();
    }

    private readonly _server = express();

    private readonly routes = [
        ['GET', '/health',
            this._GET_health.bind(this),
        ],
        ['GET', '/api/v1/tides',
            this._GET_tides.bind(this)
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
            // Smart Weather Tips (Gemini). POST vì nhận body JSON {persona, weather},
            // không phải query — weather là object lớn, không hợp query string.
            this._POST_weatherTips.bind(this)
        ]
    ]

    private _registerRouter(): void {
        // Parse body JSON (cho POST /weather-tips). Đăng ký trước route; GET
        // không có body nên không ảnh hưởng. Giới hạn size tránh payload lớn bất thường.
        this._server.use(express.json({limit: '64kb'}))

        this._server.use((_req: Request, _res: Response, next: NextFunction) => {
            if (!this._rateLimiter.allow()) {
                throw new ClientError('Too many requests.', 429, 'RATE_LIMITED')
            }

            next()
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

            // Nguồn upstream lỗi KHÔNG còn tới đây (đã nuốt thành null trong use-case
            // qua resilientSource -> response 200 partial). 500 ở đây chỉ còn lỗi nội bộ
            // ngoài dự kiến. Client nhận message chung, server log đầy đủ để debug.
            switch (true) {
                case (err instanceof ClientError):
                    statusCode = err.statusCode;
                    message = err.message;
                    code = err.code;
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
                reason: message
            });

            next()
        })
    }

    private _GET_health(_req: Request, res: Response):any {
        return res.json({
            ok: true,
            data: {
                uptime: process.uptime()
            }
        })
    }

    private async _GET_tides (req: Request, res: Response) {
        const stationId = req.query.stationId as string;
        const date = req.query.date as string;
        const daysRaw = req.query.days as string | undefined;

        if (!stationId) throw new ClientError("Query param 'stationId' is required." );
        if (!date) throw new ClientError("Query param 'date' is required (YYYYMMDD).");
        if (!/^\d{8}$/.test(date)) throw new ClientError("'date' must be YYYYMMDD");

        let days: number | undefined;

        if (daysRaw !== undefined) {
            days = parseInt(daysRaw);
            if (isNaN(days) || days < 1) {
                throw new ClientError("'days' must be a positive integer.");
            }
        }

        const data = await this._useCases.tide.getTideChart.execute({stationId, date, days})

        return res.json({
            ok: true,
            data
        })
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

        return res.json({
            ok: true,
            data
        })
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

        return res.json({
            ok: true,
            data
        })
    }

    private async _GET_mapTile (req: Request, res: Response) {
        const layer = req.params.layer as string;
        const z = parseInt(req.params.z as string);
        const x = parseInt(req.params.x as string);
        const y = parseInt(req.params.y as string);

        if (!(MAP_LAYERS as readonly string[]).includes(layer)) {
            throw new ClientError(`'layer' must be one of: ${MAP_LAYERS.join(', ')}`)
        }
        if (isNaN(z) || isNaN(x) || isNaN(y)) throw new ClientError("'z', 'x', 'y' must be integers.")

        const tile = await this._useCases.map.getMapTile.execute({layer: layer as MapLayer, z, x, y})

        res.set('Content-Type', tile.contentType)
        return res.send(tile.buffer)
    }

    private async _GET_radar (_req: Request, res: Response) {
        const data = await this._useCases.radar.getRadar.execute()

        return res.json({
            ok: true,
            data
        })
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

        return res.json({
            ok: true,
            data
        })
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
        if (!weather || typeof weather !== 'object') {
            throw new ClientError("Body field 'weather' (object) is required.")
        }

        const data = await this._useCases.tips.getWeatherTips.execute({
            persona: persona as Persona,
            weather
        })

        return res.json({
            ok: true,
            data
        })
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