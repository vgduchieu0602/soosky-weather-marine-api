// ============================================================================
// owmCondition.ts — helper DÙNG CHUNG cho 2 adapter OWM (current + forecast):
// chuyển block `weather[0]` thô của OWM thành mã icon có hậu tố ngày/đêm.
//
// Hạ tầng (Interface Adapters), KHÔNG phải domain: nó biết hình dạng JSON của
// OWM. Domain chỉ nhận kết quả đã chuẩn hoá.
// ============================================================================

export type PartOfDay = 'd' | 'n';

// 1 phần tử trong mảng `weather` của OWM (current lẫn forecast đều shape này).
export type OwmWeatherEntry = {
    id?: number;            //condition group id, vd 801
    main?: string;          //nhóm ngắn, vd "Clouds"
    description?: string;   //mô tả dài, vd "few clouds"
    icon?: string;          //mã icon kèm hậu tố, vd "02d"
};

// Ngày/đêm: ưu tiên hậu tố sẵn trong icon OWM ('02n'), fallback `sys.pod` của
// forecast. KHÔNG suy từ giờ UTC — OWM đã tính theo giờ mọc/lặn tại toạ độ đó.
export function partOfDay (weather?: OwmWeatherEntry, sysPod?: string): PartOfDay {
    const fromIcon = weather?.icon?.slice(-1);
    if (fromIcon === 'd' || fromIcon === 'n') return fromIcon;
    return sysPod === 'n' ? 'n' : 'd';
}

// Condition group id + hậu tố ngày/đêm, vd 801 -> "801d" / "801n".
export function conditionCode (weather: OwmWeatherEntry | undefined, pod: PartOfDay): string | null {
    const id = weather?.id;
    return typeof id === 'number' ? `${id}${pod}` : null;
}

// Mã icon OWM chuẩn hoá về đúng hậu tố `pod`, vd "02d" -> "02n".
export function conditionIcon (weather: OwmWeatherEntry | undefined, pod: PartOfDay): string | null {
    const icon = weather?.icon;
    return icon ? `${icon.slice(0, 2)}${pod}` : null;
}
