export interface RadarFrame {
    time: number;  // unix seconds
    path: string;  // path tương đối, ghép với `host` để ra URL tile đầy đủ
}

export interface RadarInfo {
    host: string;          // domain gốc để ghép với `path` của từng frame
    past: RadarFrame[];    // các frame quá khứ (đã xảy ra)
    nowcast: RadarFrame[]; // dự báo gần (nowcast) — có thể rỗng
    generatedAt: string;   // ISO UTC — lúc BE lấy được data này (không phải lúc RainViewer tạo)
}
