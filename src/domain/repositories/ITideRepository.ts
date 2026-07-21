// ============================================================================
// ITideRepository.ts — port cho dữ liệu thuỷ triều. Có 2 implementation:
// NoaaTidesRepository (gọi thẳng NOAA) và MongoTideRepository
// ============================================================================

import { TideChart, TideQuery } from "../entities/TideChart";

export default interface TideRepository {
    getTideChart(query: TideQuery): Promise<TideChart>;
}
