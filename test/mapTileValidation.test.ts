import assert from 'node:assert/strict'
import test from 'node:test'
import Server from '../src/http/Server'
import ClientError from '../src/http/ClientError'
import RateLimiter from '../src/http/RateLimiter'

function createServer (
    getTile = async () => ({buffer: Buffer.from('tile'), contentType: 'image/png'}),
    mapTilesEnabled = true
) {
    return new Server({
        tide: {getTideChart: {execute: async () => undefined}},
        buoy: {
            getBuoyWeatherDetail: {execute: async () => undefined},
            listBuoys: {execute: async () => undefined}
        },
        weather: {getPointWeatherDetail: {execute: async () => undefined}},
        map: {getMapTile: {execute: getTile}},
        radar: {getRadar: {execute: async () => undefined}},
        alert: {getAlerts: {execute: async () => undefined}},
        tips: {getWeatherTips: {execute: async () => undefined}}
    } as any, new RateLimiter(1, 1, 1, false), new RateLimiter(1, 1, 1, false), mapTilesEnabled)
}

function mapResponse () {
    return {
        set: () => undefined,
        send: () => undefined
    }
}

async function expectBadTileRequest (params: Record<string, string>) {
    await assert.rejects(
        () => (createServer() as any)._GET_mapTile({params}, mapResponse()),
        (err: unknown) => err instanceof ClientError && err.statusCode === 400
    )
}

test('rejects a map zoom below the configured minimum', async () => {
    await expectBadTileRequest({layer: 'temperature', z: '0', x: '0', y: '0'})
})

test('rejects a map zoom above the configured maximum', async () => {
    await expectBadTileRequest({layer: 'temperature', z: '6', x: '2', y: '6'})
})

test('rejects an x coordinate outside the tile range for its zoom', async () => {
    await expectBadTileRequest({layer: 'temperature', z: '1', x: '2', y: '1'})
})

test('rejects a negative x coordinate', async () => {
    await expectBadTileRequest({layer: 'temperature', z: '4', x: '-1', y: '6'})
})

test('rejects a negative y coordinate', async () => {
    await expectBadTileRequest({layer: 'temperature', z: '4', x: '2', y: '-1'})
})

test('rejects a non-integer tile coordinate', async () => {
    await expectBadTileRequest({layer: 'temperature', z: '4', x: '2.5', y: '6'})
})

test('passes a valid map tile request to the map use case', async () => {
    const requests: unknown[] = []
    const server = createServer(async (query) => {
        requests.push(query)
        return {buffer: Buffer.from('tile'), contentType: 'image/png'}
    })

    await (server as any)._GET_mapTile(
        {params: {layer: 'temperature', z: '1', x: '1', y: '0'}},
        mapResponse()
    )

    assert.deepEqual(requests, [{layer: 'temperature', z: 1, x: 1, y: 0}])
})

test('does not invoke the map use case when map tiles are disabled', async () => {
    let requests = 0
    const server = createServer(async () => {
        requests += 1
        return {buffer: Buffer.from('tile'), contentType: 'image/png'}
    }, false)

    await assert.rejects(
        () => (server as any)._GET_mapTile(
            {params: {layer: 'temperature', z: '1', x: '1', y: '0'}},
            mapResponse()
        ),
        (err: unknown) => err instanceof ClientError && err.statusCode === 503 && err.code === 'MAP_TILES_DISABLED'
    )

    assert.equal(requests, 0)
})
