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

test('contains a rejected task and runs a later tick', async () => {
    let invocations = 0
    let intervalTick!: () => void
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    const originalConsoleError = console.error

    globalThis.setInterval = ((tick: () => void) => {
        intervalTick = tick
        return 456 as unknown as NodeJS.Timeout
    }) as typeof setInterval
    globalThis.clearInterval = (() => {}) as typeof clearInterval
    console.error = () => {}

    try {
        const scheduler = new Scheduler(2500, async () => {
            invocations += 1
            if (invocations === 1) throw new Error('transient failure')
        })

        scheduler.start(true)
        await Promise.resolve()
        await Promise.resolve()
        intervalTick()
        await Promise.resolve()

        assert.equal(invocations, 2)
        scheduler.stop()
    } finally {
        globalThis.setInterval = originalSetInterval
        globalThis.clearInterval = originalClearInterval
        console.error = originalConsoleError
    }
})

test('stop clears the interval and waits for an active task to drain', async () => {
    let releaseTask!: () => void
    let taskStarted!: () => void
    const started = new Promise<void>((resolve) => { taskStarted = resolve })
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    const clearedIntervals: NodeJS.Timeout[] = []

    globalThis.setInterval = (() => 789 as unknown as NodeJS.Timeout) as typeof setInterval
    globalThis.clearInterval = ((timer: NodeJS.Timeout) => {
        clearedIntervals.push(timer)
    }) as typeof clearInterval

    try {
        const scheduler = new Scheduler(1000, async () => {
            taskStarted()
            await new Promise<void>((resolve) => { releaseTask = resolve })
        })
        scheduler.start(true)
        await started

        let stopped = false
        const stopping = Promise.resolve(scheduler.stop()).then(() => { stopped = true })
        await Promise.resolve()

        assert.equal(stopped, false)
        assert.deepEqual(clearedIntervals, [789 as unknown as NodeJS.Timeout])

        releaseTask()
        await stopping
        assert.equal(stopped, true)
    } finally {
        releaseTask?.()
        globalThis.setInterval = originalSetInterval
        globalThis.clearInterval = originalClearInterval
    }
})

test('can start again after stopping', () => {
    const scheduledIntervals: number[] = []
    const clearedIntervals: NodeJS.Timeout[] = []
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval

    globalThis.setInterval = ((_tick: () => void, intervalMs: number) => {
        scheduledIntervals.push(intervalMs)
        return (455 + scheduledIntervals.length) as unknown as NodeJS.Timeout
    }) as typeof setInterval
    globalThis.clearInterval = ((timer: NodeJS.Timeout) => {
        clearedIntervals.push(timer)
    }) as typeof clearInterval

    try {
        const scheduler = new Scheduler(2500, async () => {})
        scheduler.start(false)
        scheduler.stop()
        scheduler.start(false)
        scheduler.stop()

        assert.deepEqual(scheduledIntervals, [2500, 2500])
        assert.deepEqual(clearedIntervals, [456, 457].map((value) => value as unknown as NodeJS.Timeout))
    } finally {
        globalThis.setInterval = originalSetInterval
        globalThis.clearInterval = originalClearInterval
    }
})
