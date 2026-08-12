import assert from 'node:assert/strict'
import test from 'node:test'
import * as configModule from '../src/config'

type ConfigFactory = (env: Record<string, string | undefined>) => typeof configModule.default

const createConfig = (configModule as unknown as { createConfig: ConfigFactory }).createConfig

test('rejects explicitly invalid positive-integer worker settings with variable-specific errors', () => {
    for (const key of ['MONGO_MAX_POOL_SIZE', 'NDBC_FETCH_TIMEOUT_MS', 'SYNC_INTERVAL_MS'] as const) {
        for (const value of ['', '0', '-1', '1.5', '12ms']) {
            assert.throws(
                () => createConfig({ [key]: value }),
                new RegExp(key),
                `${key}=${JSON.stringify(value)}`
            )
        }
    }
})

test('validates the legacy sync interval alias when the primary name is absent', () => {
    assert.throws(
        () => createConfig({ BUOY_SYNC_INTERVAL_MS: '0' }),
        /BUOY_SYNC_INTERVAL_MS/
    )
})

test('allows zero retries but rejects other invalid retry values', () => {
    assert.equal(createConfig({ NDBC_FETCH_RETRIES: '0' }).ndbc.retries, 0)

    for (const value of ['', '-1', '1.5', 'many']) {
        assert.throws(
            () => createConfig({ NDBC_FETCH_RETRIES: value }),
            /NDBC_FETCH_RETRIES/,
            `NDBC_FETCH_RETRIES=${JSON.stringify(value)}`
        )
    }
})

test('prefers SYNC settings and supports legacy aliases only as fallback', () => {
    const primary = createConfig({
        SYNC_INTERVAL_MS: '2000',
        BUOY_SYNC_INTERVAL_MS: '3000',
        SYNC_RUN_ON_BOOT: 'false',
        BUOY_SYNC_RUN_ON_BOOT: 'true'
    })
    assert.equal(primary.sync.intervalMs, 2000)
    assert.equal(primary.sync.runOnBoot, false)

    const legacy = createConfig({
        BUOY_SYNC_INTERVAL_MS: '4000',
        BUOY_SYNC_RUN_ON_BOOT: 'false'
    })
    assert.equal(legacy.sync.intervalMs, 4000)
    assert.equal(legacy.sync.runOnBoot, false)
})
