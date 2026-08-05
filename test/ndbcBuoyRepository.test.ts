import assert from "node:assert/strict";
import test from "node:test";
import NdbcBuoyRepository from "../src/adapters/ndbc/NdbcBuoyRepository";

test("treats an out-of-range NDBC wind direction as unavailable", async (t) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(
        "2026 08 05 04 30 361 5.0 6.0 0.6 6 4.2 134 1016.5 29.3 30.5 24.4 10 +0.3 0\n"
    );
    t.after(() => { globalThis.fetch = originalFetch; });

    const result = await new NdbcBuoyRepository().getBuoyWeather({ buoyId: "46042" });

    assert.equal(result.windDirection, null);
});
