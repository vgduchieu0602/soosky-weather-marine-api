import mongoose from 'mongoose'
import config from '../../config'

type ConnectMongoOptions = {
    maxPoolSize?: number
}

export default async function connectMongo(options?: ConnectMongoOptions): Promise<void> {
    if (!config.mongo.uri) {
        throw new Error('MONGO_URI is required.')
    }
    if (options?.maxPoolSize === undefined) {
        await mongoose.connect(config.mongo.uri)
    } else {
        await mongoose.connect(config.mongo.uri, { maxPoolSize: options.maxPoolSize })
    }
    // In host + database: MONGO_URI có thể không ghi dbname (mongoose mặc định
    // "test"), nên đây là cách nhanh nhất để phát hiện API và worker buoy-sync
    // đang nối 2 DB khác nhau.
    console.log(`Mongo connected: host=${mongoose.connection.host} db=${mongoose.connection.name}`)
}
