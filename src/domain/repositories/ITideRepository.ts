import { TideChart, TideQuery } from "../entities/TideChart";

export default interface TideRepository {
    getTideChart(query: TideQuery): Promise<TideChart>;
}
