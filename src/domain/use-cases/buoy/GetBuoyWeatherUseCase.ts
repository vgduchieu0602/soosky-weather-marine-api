import BuoyWeatherRepository from '../../repositories/IBuoyWeatherRepository'
import {BuoyWeather, BuoyQuery} from '../../entities/BuoyWeather'

export default class GetBuoyWeatherUseCase {
    constructor (
        private _buoyRepo: BuoyWeatherRepository
    ) {}

    public execute (query: BuoyQuery): Promise<BuoyWeather> {
        return this._buoyRepo.getBuoyWeather(query);
    }
}
