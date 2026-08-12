export default class Scheduler {
    private _interval: ReturnType<typeof setInterval> | undefined
    private _activeTick: Promise<void> | undefined

    public constructor(
        private readonly _intervalMs: number,
        private readonly _task: () => Promise<void>
    ) {}

    public start(runOnBoot: boolean): void {
        if (this._interval) return

        if (runOnBoot) this._tick()
        this._interval = setInterval(() => { this._tick() }, this._intervalMs)
    }

    public async stop(): Promise<void> {
        if (this._interval) {
            clearInterval(this._interval)
            this._interval = undefined
        }
        await this._activeTick
    }

    private _tick(): void {
        if (this._activeTick) return

        const activeTick = this._runTask()
        this._activeTick = activeTick
        void activeTick.finally(() => {
            if (this._activeTick === activeTick) this._activeTick = undefined
        })
    }

    private async _runTask(): Promise<void> {
        try {
            await this._task()
        } catch (error) {
            console.error('Scheduled task failed.', error)
        }
    }
}
