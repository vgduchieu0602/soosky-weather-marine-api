import mongoose from 'mongoose'
import config from '../../config'

export default async function connectMongo(): Promise<void> {
    if (!config.mongo.uri) {
        throw new Error('MONGO_URI is required.')
    }
    await mongoose.connect(config.mongo.uri)
    console.log('Mongo connected.')
}
