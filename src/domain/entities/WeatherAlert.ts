export type AlertQuery = {
    lat: number;
    lon: number;
}

export interface WeatherAlert {
    title: string;
    severity: string | null;
    regions: string[];
    onsetLocal: string | null; // giờ địa phương bắt đầu hiệu lực cảnh báo
    endsLocal: string | null;  // giờ địa phương kết thúc hiệu lực cảnh báo
}

export interface WeatherAlerts {
    lat: number;
    lon: number;
    alerts: WeatherAlert[]; // rỗng = không có cảnh báo nào tại toạ độ này
    updatedAt: string;
}
