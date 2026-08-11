import assert from 'node:assert/strict'
import test from 'node:test'
import Scheduler from '../src/scheduler/Scheduler'

test('skips overlapping ticks while a task is pending', async () => {
    let resolveFirstTask!: () => void
    let invocations = 0
    let intervalTick!: () => void
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval

    globalThis.setInterval = ((tick: () => void) => {
        intervalTick = tick
        return 123 as unknown as NodeJS.Timeout
    }) as typeof setInterval
    globalThis.clearInterval = (() => {}) as typeof clearInterval

    try {
        const scheduler = new Scheduler(1000, async () => {
            invocations += 1
            await new Promise<void>((resolve) => { resolveFirstTask = resolve })
        })

        scheduler.start(true)
        intervalTick()

        assert.equal(invocations, 1)
        resolveFirstTask()
        await Promise.resolve()
        scheduler.stop()
    } finally {
        globalThis.setInterval = originalSetInterval
        globalThis.clearInterval = originalClearInterval
    }
})

test('starts an interval and clears it when stopped', () => {
    let scheduledInterval: number | undefined
    let clearedInterval: NodeJS.Timeout | undefined
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval

    globalThis.setInterval = ((_tick: () => void, intervalMs: number) => {
        scheduledInterval = intervalMs
        return 456 as unknown as NodeJS.Timeout
    }) as typeof setInterval
    globalThis.clearInterval = ((timer: NodeJS.Timeout) => {
        clearedInterval = timer
    }) as typeof clearInterval

    try {
        const scheduler = new Scheduler(2500, async () => {})
        scheduler.start(false)
        scheduler.stop()

        assert.equal(scheduledInterval, 2500)
        assert.equal(clearedInterval, 456 as unknown as NodeJS.Timeout)
    } finally {
        globalThis.setInterval = originalSetInterval
        globalThis.clearInterval = originalClearInterval
    }
})
