// ============================================================================
// IWeatherAdvisorRepository.ts — port cho Smart Weather Tips. Implementation:
// GeminiWeatherAdvisor (gọi Gemini). Domain/use-case không biết Gemini tồn tại,
// chỉ gọi getTips qua interface này — đổi provider AI chỉ cần adapter mới.
// ============================================================================

import {WeatherTips, WeatherTipsQuery} from '../entities/WeatherTips'

export default interface WeatherAdvisorRepository {
    getTips (query: WeatherTipsQuery): Promise<WeatherTips>
}
