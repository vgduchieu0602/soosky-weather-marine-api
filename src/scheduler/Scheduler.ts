export default class Scheduler {
    private _interval: ReturnType<typeof setInterval> | undefined
    private _running = false

    public constructor(
        private readonly _intervalMs: number,
        private readonly _task: () => Promise<void>
    ) {}

    public start(runOnBoot: boolean): void {
        if (this._interval) return

        if (runOnBoot) void this._tick()
        this._interval = setInterval(() => { void this._tick() }, this._intervalMs)
    }

    public stop(): void {
        if (!this._interval) return
        clearInterval(this._interval)
        this._interval = undefined
    }

    private async _tick(): Promise<void> {
        if (this._running) return

        this._running = true
        try {
            await this._task()
        } catch (error) {
            console.error('Scheduled task failed.', error)
        } finally {
            this._running = false
        }
    }
}
