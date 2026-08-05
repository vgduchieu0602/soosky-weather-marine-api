import assert from "node:assert/strict";
import test from "node:test";
import OwmCurrentRepository from "../src/adapters/owm/OwmCurrentRepository";

test("treats an out-of-range OpenWeather wind direction as unavailable", async (t) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
        wind: { deg: 361 }
    }));
    t.after(() => { globalThis.fetch = originalFetch; });

    const result = await new OwmCurrentRepository().getPointWeather({ lat: 10, lon: 106 });

    assert.equal(result.windDirection, null);
});
