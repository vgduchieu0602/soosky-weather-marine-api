// ============================================================================
// IWeatherAdvisorRepository.ts — port cho Smart Weather Tips. Implementation:
// GeminiWeatherAdvisor (gọi Gemini). Domain/use-case không biết Gemini tồn tại,
// chỉ gọi getTips qua interface này — đổi provider AI chỉ cần adapter mới.
// ============================================================================

import {WeatherTips, Persona, WeatherTipsWeather} from '../entities/WeatherTips'

// Query = input truyền vào (không phải data lưu trữ) -> khai ở port.
export type WeatherTipsQuery = {
    persona: Persona;
    weather: WeatherTipsWeather;
}

export default interface WeatherAdvisorRepository {
    getTips (query: WeatherTipsQuery): Promise<WeatherTips>
}
