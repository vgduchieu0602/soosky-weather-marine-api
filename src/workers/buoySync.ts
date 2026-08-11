import mongoose from 'mongoose'
import config from '../config'
import connectMongo from '../adapters/mongo/connectMongo'
import MongoBuoyStationStore from '../adapters/mongo/stores/MongoBuoyStationStore'
import NdbcStationSource from '../adapters/ndbc/NdbcStationSource'
import SyncBuoyStationsUseCase from '../domain/use-cases/buoy/SyncBuoyStationsUseCase'
import Scheduler from '../scheduler/Scheduler'

async function main(): Promise<void> {
    await connectMongo({ maxPoolSize: config.mongo.maxPoolSize })

    const source = new NdbcStationSource({
        url: config.ndbc.activeStationsUrl,
        timeoutMs: config.ndbc.fetchTimeoutMs,
        retries: config.ndbc.retries
    })
    const syncBuoyStations = new SyncBuoyStationsUseCase(source, new MongoBuoyStationStore())
    const scheduler = new Scheduler(config.sync.intervalMs, async () => {
        const stats = await syncBuoyStations.execute()
        console.log(
            `Buoy sync complete: total=${stats.total} created=${stats.created} changed=${stats.changed} unchanged=${stats.unchanged}`
        )
    })

    let shuttingDown = false
    const shutdown = async (): Promise<void> => {
        if (shuttingDown) return
        shuttingDown = true
        await scheduler.stop()
        await mongoose.disconnect()
    }

    const handleShutdownFailure = (error: unknown): void => {
        console.error('Buoy sync worker failed during shutdown.', error)
        process.exitCode = 1
    }

    process.once('SIGINT', () => { void shutdown().catch(handleShutdownFailure) })
    process.once('SIGTERM', () => { void shutdown().catch(handleShutdownFailure) })
    scheduler.start(config.sync.runOnBoot)
}

main().catch((error: unknown) => {
    console.error('Buoy sync worker failed to start.', error)
    process.exitCode = 1
})
