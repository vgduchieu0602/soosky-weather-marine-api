// ============================================================================
// GeminiWeatherAdvisor.ts — adapter gọi Gemini sinh Smart Weather Tips. Cùng
// khuôn GeminiPlantAnalyzer bên soosky-plant-care-api: dùng @google/genai,
// responseSchema ép cấu trúc JSON, systemInstruction là prompt marine advisor.
// KHÁC: input là text JSON (persona + weather), không phải ảnh; không cần
// googleSearch grounding (data đã có sẵn trong input).
// ============================================================================

import {GoogleGenAI, ThinkingLevel} from '@google/genai'
import WeatherAdvisorRepository from '../../domain/repositories/IWeatherAdvisorRepository'
import {WeatherTips, WeatherTipsQuery} from '../../domain/entities/WeatherTips'
import {WEATHER_TIPS_INSTRUCTION} from './instruction/weatherTips'
import WEATHER_TIPS_SCHEMA from './output-structure/weather-tips-schema.json' with {type: 'json'}

const MODEL_CONFIG = {
    MODEL: 'gemini-3.1-flash-lite',
    THINKING_LEVEL: ThinkingLevel.LOW,      // tip ngắn, không cần suy nghĩ sâu -> nhanh/rẻ
    RESPONSE_MIME_TYPE: 'application/json',
    TIMEOUT_MS: 20000,
}

export default class GeminiWeatherAdvisor implements WeatherAdvisorRepository {
    private _gemini: GoogleGenAI

    constructor (apiKey: string, model?: string) {
        this._gemini = new GoogleGenAI({apiKey, httpOptions: {timeout: MODEL_CONFIG.TIMEOUT_MS}})
        // Cho phép override model qua config (GEMINI_MODEL), mặc định flash-lite.
        this._model = model || MODEL_CONFIG.MODEL
    }

    private _model: string

    public async getTips (query: WeatherTipsQuery): Promise<WeatherTips> {
        // Gửi persona + weather dưới dạng text JSON trong user content; prompt
        // (system instruction) mô tả cách xử lý.
        const userInput = JSON.stringify({persona: query.persona, weather: query.weather})

        let text: string | undefined
        try {
            const response = await this._gemini.models.generateContent({
                model: this._model,
                config: {
                    responseMimeType: MODEL_CONFIG.RESPONSE_MIME_TYPE,
                    responseSchema: WEATHER_TIPS_SCHEMA,
                    systemInstruction: WEATHER_TIPS_INSTRUCTION,
                    thinkingConfig: {thinkingLevel: MODEL_CONFIG.THINKING_LEVEL},
                },
                contents: [{role: 'user', parts: [{text: userInput}]}],
            } as never)
            text = (response as {text?: string}).text
        } catch (err) {
            const status = (err as {status?: number})?.status
            const rawMsg = (err as {message?: string})?.message ?? String(err)
            throw new Error(`Gemini weather tips call failed (status=${status ?? 'n/a'}): ${rawMsg}`)
        }

        if (!text) throw new Error('Empty response from Gemini API')

        let parsed: WeatherTips
        try {
            parsed = JSON.parse(text) as WeatherTips
        } catch (err) {
            console.error('[Gemini raw response]:', text.slice(0, 500))
            throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`)
        }

        // Guard: responseSchema đã ép, nhưng chốt lại tips là mảng không rỗng.
        if (!parsed || !Array.isArray(parsed.tips) || parsed.tips.length === 0) {
            throw new Error('Gemini response missing tips')
        }

        // persona luôn echo lại đúng input (không tin tưởng model đổi enum).
        return {persona: query.persona, tips: parsed.tips}
    }
}
