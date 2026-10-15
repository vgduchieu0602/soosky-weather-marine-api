import assert from "node:assert/strict";
import test from "node:test";
import NdbcBuoyRepository from "../src/adapters/ndbc/NdbcBuoyRepository";

// #YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
function row (minute: string, wdir: string, wspd: string, gst: string, wvht = "1.4"): string {
    return `2026 08 22 07 ${minute} ${wdir} ${wspd} ${gst} ${wvht} MM 4.6 213 1013.3 22.0 21.9 22.0 MM MM MM`;
}

function stubFetch (t: { after: (fn: () => void) => void }, body: string): void {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(body);
    t.after(() => { globalThis.fetch = originalFetch; });
}

test("treats an out-of-range NDBC wind direction as unavailable", async (t) => {
    stubFetch(t, "2026 08 05 04 30 361 5.0 6.0 0.6 6 4.2 134 1016.5 29.3 30.5 24.4 10 +0.3 0\n");

    const result = await new NdbcBuoyRepository().getBuoyWeather({ buoyId: "46042" });

    assert.equal(result.windDirection, null);
});

test("backfills a column from an older row when the newest row reports MM", async (t) => {
    // Đúng hình dạng feed 44008 lúc 07:20: dòng mới nhất mất cả 3 cột gió.
    stubFetch(t, [row("20", "MM", "MM", "MM"), row("10", "60", "5.0", "6.0")].join("\n"));

    const result = await new NdbcBuoyRepository().getBuoyWeather({ buoyId: "44008" });

    assert.equal(result.windDirection, 60);
    assert.equal(result.windSpeed, 5);
    assert.equal(result.gust, 6);
    // updatedAt vẫn là thời điểm của dòng mới nhất.
    assert.equal(result.updatedAt, "2026-08-22T07:20:00Z");
});

test("keeps the newest value for columns that are present", async (t) => {
    stubFetch(t, [row("20", "90", "3.0", "4.0", "1.1"), row("10", "60", "5.0", "6.0", "1.4")].join("\n"));

    const result = await new NdbcBuoyRepository().getBuoyWeather({ buoyId: "44008" });

    assert.equal(result.windDirection, 90);
    assert.equal(result.windSpeed, 3);
    assert.equal(result.waveHeight, 1.1);
});

test("backfills each column independently", async (t) => {
    stubFetch(t, [
        row("20", "MM", "3.0", "MM", "MM"),
        row("10", "60", "MM", "MM", "1.4")
    ].join("\n"));

    const result = await new NdbcBuoyRepository().getBuoyWeather({ buoyId: "44008" });

    assert.equal(result.windSpeed, 3);      // dòng mới nhất
    assert.equal(result.windDirection, 60); // lùi 1 dòng
    assert.equal(result.gust, null);        // không dòng nào có
    assert.equal(result.waveHeight, 1.4);   // lùi 1 dòng
});

test("skips an out-of-range wind direction and takes the next valid row", async (t) => {
    stubFetch(t, [row("20", "361", "5.0", "6.0"), row("10", "180", "5.0", "6.0")].join("\n"));

    const result = await new NdbcBuoyRepository().getBuoyWeather({ buoyId: "44008" });

    assert.equal(result.windDirection, 180);
});

test("does not look back further than the lookback window", async (t) => {
    const rows = [
        row("50", "MM", "MM", "MM"),
        row("40", "MM", "MM", "MM"),
        row("30", "MM", "MM", "MM"),
        row("20", "MM", "MM", "MM"),
        row("10", "MM", "MM", "MM"),
        row("00", "MM", "MM", "MM"),
        row("50", "60", "5.0", "6.0")   // dòng thứ 7 -> ngoài cửa sổ
    ];
    stubFetch(t, rows.join("\n"));

    const result = await new NdbcBuoyRepository().getBuoyWeather({ buoyId: "44008" });

    assert.equal(result.windSpeed, null);
    assert.equal(result.windDirection, null);
});

test("throws when the station file has no data rows", async (t) => {
    stubFetch(t, "#YY  MM DD hh mm WDIR WSPD GST\n#yr  mo dy hr mn degT m/s  m/s\n");

    await assert.rejects(
        new NdbcBuoyRepository().getBuoyWeather({ buoyId: "44008" }),
        /has no data/
    );
});
