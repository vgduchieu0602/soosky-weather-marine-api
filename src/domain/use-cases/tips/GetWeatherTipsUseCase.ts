import WeatherAdvisorRepository, {WeatherTipsQuery} from '../../repositories/IWeatherAdvisorRepository'
import {WeatherTips} from '../../entities/WeatherTips'

// Use-case mỏng — chuyển tiếp sang advisor repo. Cùng khung mọi use-case khác.
export default class GetWeatherTipsUseCase {
    constructor (private _advisorRepo: WeatherAdvisorRepository) {}

    public execute (query: WeatherTipsQuery): Promise<WeatherTips> {
        return this._advisorRepo.getTips(query)
    }
}
