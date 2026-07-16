import config from './config'
import Server from './http/Server'

/*----------------------------------------------------------------------------------*/

const {
    http: {
        port: HTTP_PORT,
        host: HTTP_HOST
    }
} = config;

/*----------------------------------------------------------------------------------*/

(async () => {
    await startServer()
})()

/*----------------------------------------------------------------------------------*/

async function startServer() {
    const server = new Server();
    await server.listen(HTTP_PORT, HTTP_HOST);
    console.log(`Soosky Weather Marine API running on http://${HTTP_HOST}:${HTTP_PORT}`);
}