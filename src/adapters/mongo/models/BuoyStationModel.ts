// ============================================================================
// BuoyStationModel.ts — schema collection "buoys" (DÙNG CHUNG với
// soosky-bot-weather-marine). Chỗ DUY NHẤT trong API này biết cú pháp Mongoose
// cho buoys.
//
// ⚠️ CONTRACT: PHẢI khớp schema bên bot. Tên collection pin cứng 'buoys'. Bot
// GHI (crawl NDBC), API ĐỌC + lazy seed (chỉ insert khi thiếu, không đè bot).
// KHÔNG dùng option `timestamps` — thời gian tự quản (changedAt/lastSeenAt/firstSeenAt).
// ============================================================================

import { Schema, model } from 'mongoose'

export interface BuoyStationDoc {
    buoyId: string;
    name: string | null;
    lat: number;
    lon: number;
    source: string;
    firstSeenAt?: Date;
    lastSeenAt?: Date;
    changedAt?: Date;
}

const schema = new Schema<BuoyStationDoc>({
    buoyId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: null },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    source: { type: String, default: 'ndbc-activestations' },
    firstSeenAt: { type: Date },
    lastSeenAt: { type: Date },
    changedAt: { type: Date }
}, {
    collection: 'buoys',
    versionKey: false
})

schema.index({ lon: 1, lat: 1 })

export default model<BuoyStationDoc>('BuoyStation', schema)
