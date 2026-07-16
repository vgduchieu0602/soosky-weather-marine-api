import express, {NextFunction, Request, Response} from 'express'
import ClientError from './ClientError'

export {Server as default}

/*----------------------------------------------------------------------------------------*/

const HTTP_DEFAULT_PORT = 3001;
const HTTP_DEFAULT_HOST = "0.0.0.0";

/*----------------------------------------------------------------------------------------*/

class Server {
    constructor () {
        this._registerRouter();
        this._registerErrorHandler();
    }

    private readonly _server = express();

    private readonly routes = [
        ['GET', '/health',
            this._GET_health.bind(this),
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