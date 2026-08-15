import assert from 'node:assert/strict'
import test from 'node:test'
import RateLimiter from '../src/http/RateLimiter'
import Server from '../src/http/Server'
import ClientError from '../src/http/ClientError'

test('blocks an IP only after it exceeds its own quota', () => {
    const limiter = new RateLimiter(60000, 3)

    assert.equal(limiter.check('1.1.1.1'), false)
    assert.equal(limiter.check('1.1.1.1'), false)
    assert.equal(limiter.check('1.1.1.1'), false)
    assert.equal(limiter.check('1.1.1.1'), true)
})

test('quota is per IP — one spamming client does not block others', () => {
    const limiter = new RateLimiter(60000, 2)

    limiter.check('1.1.1.1')
    limiter.check('1.1.1.1')
    assert.equal(limiter.check('1.1.1.1'), true)
    // Không còn trần global: IP khác vẫn dùng đủ quota riêng.
    assert.equal(limiter.check('2.2.2.2'), false)
    assert.equal(limiter.check('2.2.2.2'), false)
    assert.equal(limiter.check('2.2.2.2'), true)
})

test('quota resets after the window slides past', () => {
    const originalNow = Date.now
    const limiter = new RateLimiter(60000, 1)
    try {
        let now = 1_000_000
        Date.now = () => now
        assert.equal(limiter.check('1.1.1.1'), false)
        assert.equal(limiter.check('1.1.1.1'), true)
        now += 60_001
        assert.equal(limiter.check('1.1.1.1'), false)
    } finally {
        Date.now = originalNow
    }
})

test('disabled limiter never blocks', () => {
    const limiter = new RateLimiter(60000, 1, false)
    for (let i = 0; i < 10; i++) assert.equal(limiter.check('1.1.1.1'), false)
})

// --- middleware wiring: /api/v1/maps/* miễn rate limit, endpoint khác thì không ---
// Chạy đúng các middleware (req, res, next) ẩn danh mà Server đăng ký trước route
// (trace + rate limit). Bỏ jsonParser (có tên), error handler (4 tham số) và
// catch-all 404 (0 tham số).
function runMiddleware (path: string, limiter: RateLimiter): unknown {
    const app = (new Server({} as any, limiter, true) as any)._server
    const layers = app.router?.stack ?? app._router.stack
    const handlers = layers
        .filter((layer: any) => !layer.route && layer.name === '<anonymous>' && layer.handle.length === 3)
        .map((layer: any) => layer.handle)
    assert.ok(handlers.length > 0, 'no middleware found on the express stack')

    for (const handle of handlers) {
        try {
            handle({path, ip: '1.1.1.1', method: 'GET'}, {}, () => {})
        } catch (err) {
            return err
        }
    }
    return null
}

test('map tile requests skip the rate limiter entirely', () => {
    const limiter = new RateLimiter(60000, 1)
    // Quota = 1, đã dùng hết bởi 1 request data.
    assert.equal(limiter.check('1.1.1.1'), false)

    assert.equal(runMiddleware('/api/v1/maps/temperature/5/1/1', limiter), null)

    const error = runMiddleware('/api/v1/weather', limiter)
    assert.ok(error instanceof ClientError)
    assert.equal(error.statusCode, 429)
    assert.equal(error.code, 'RATE_LIMITED')
})
