// ============================================================================
// Smart Weather Tips — lời khuyên ngắn, an toàn, theo persona hoạt động của
// người dùng, sinh bởi Gemini. Input = persona + weather; output = 2-4 tip ngắn.
// ============================================================================

// 5 persona hợp lệ (khớp enum trong output schema Gemini). Server validate
// persona nằm trong danh sách này trước khi gọi use-case.
export const PERSONAS = [
    'Traveler',
    'Water Sports',
    'Coastal Captain',
    'Offshore Fishing',
    'Other'
] as const;

export type Persona = (typeof PERSONAS)[number];

// Weather đầu vào — client gửi lên (thường lấy từ /weather hoặc /buoys/.../weather
// mà FE đã có sẵn). Field nullable đúng theo schema; Gemini tự bỏ tip phụ thuộc
// field null thay vì đoán. Kiểu permissive: chỉ chuyển tiếp cho Gemini.
export interface WeatherTipsWeather {
    temperature: number;
    windSpeed: number;
    windDirection: number | string;
    gust: number;
    waveHeight: number | null;
    waterTemp: number | null;
    atmospherePressure: number;
    updatedAt: string;
    visibility: number | null;
    tide: string | number;
    uvIndex: number;
    cloudCover: number;
    humidity: number | null;
}

export type WeatherTipsQuery = {
    persona: Persona;
    weather: WeatherTipsWeather;
}

export interface WeatherTips {
    persona: Persona;
    tips: string[];   //2-4 tip, mỗi tip <=100 ký tự
}
