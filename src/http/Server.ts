import express, {NextFunction, Request, Response} from 'express'
import ClientError from './ClientError'
import GetTideChartUseCase from '../domain/use-cases/tide/getTideChartUseCase';
import GetBuoyWeatherUseCase from '../domain/use-cases/buoy/GetBuoyWeatherUseCase';

export {Server as default}

/*----------------------------------------------------------------------------------------*/

const HTTP_DEFAULT_PORT = 3001;
const HTTP_DEFAULT_HOST = "0.0.0.0";

/*----------------------------------------------------------------------------------------*/

type ServerUseCases = {
    tide: {
        getTideChart: GetTideChartUseCase;
    }
    buoy: {
        getBuoyWeather: GetBuoyWeatherUseCase;
    }
}

/*----------------------------------------------------------------------------------------*/

class Server {
    constructor (
        private _useCases: ServerUseCases
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
        ]
    ]

    private _registerRouter(): void {
        for (const [method, path, ...handlers] of this.routes) {
            (this._server as any)[(method as string).toLowerCase()](path, ...handlers)
        }

        this._server.use(() => {
            throw new ClientError('Not Found.', 404, 'NOT_FOUND')
        });
    }

    private _registerErrorHandler(): void {
        this._server.use((err:any, _req: Request, res: Response, next: NextFunction) => {
            let statusCode: number;
            let message: string;

            switch (true) {
                case (err instanceof ClientError):
                    statusCode = err.statusCode;
                    message = err.message;
                    break;
                default:
                    statusCode = 500;
                    message = "Internal Server Error";
                    console.error(err.stack || err)
            }

            res.status(statusCode).json({
                ok: false,
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

        if (!buoyId) throw new ClientError("Path param 'buoyId' is required.")

        const data = await this._useCases.buoy.getBuoyWeather.execute({buoyId})

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