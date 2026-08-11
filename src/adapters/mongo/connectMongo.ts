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
    console.log('Mongo connected.')
}
