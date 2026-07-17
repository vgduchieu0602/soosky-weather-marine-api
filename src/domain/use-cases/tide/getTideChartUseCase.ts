import TideRepository from "../../repositories/ITideRepository";
import {TideChart, TideQuery} from '../../entities/TideChart'

export default class GetTideChartUseCase {
    constructor (private _tideRepo: TideRepository) {}

    public execute (query: TideQuery): Promise<TideChart> {
        return this._tideRepo.getTideChart(query);
    }
}