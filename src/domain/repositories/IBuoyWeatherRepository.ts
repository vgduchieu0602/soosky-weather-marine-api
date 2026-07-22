import {BuoyWeather} from '../entities/BuoyWeather'

// Query = INPUT truyền vào (không phải data backend lưu trữ) -> khai ở port.
export type BuoyQuery = {
    buoyId: string; //NDBC station ID, ví dụ "46053"
}

export default interface BuoyWeatherRepository {
    getBuoyWeather (query: BuoyQuery): Promise<BuoyWeather>
}
