import TideRepository, {TideQuery} from "../../repositories/ITideRepository";
import {TideChart} from '../../entities/TideChart'

export default class GetTideChartUseCase {
    constructor (private _tideRepo: TideRepository) {}

    public execute (query: TideQuery): Promise<TideChart> {
        return this._tideRepo.getTideChart(query);
    }
}