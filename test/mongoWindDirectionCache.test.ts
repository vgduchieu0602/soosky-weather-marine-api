import assert from "node:assert/strict";
import test from "node:test";
import MongoBuoyWeatherCache from "../src/adapters/mongo/stores/MongoBuoyWeatherCache";
import MongoPointWeatherCache from "../src/adapters/mongo/stores/MongoPointWeatherCache";
import BuoyWeatherCacheModel from "../src/adapters/mongo/models/BuoyWeatherCacheModel";
import PointWeatherCacheModel from "../src/adapters/mongo/models/PointWeatherCacheModel";

test("treats an out-of-range wind direction from the point-weather cache as unavailable", async (t) => {
    const originalFindOne = PointWeatherCacheModel.findOne;
    (PointWeatherCacheModel as any).findOne = () => ({
        lean: async () => ({
            lat: 10,
            lon: 106,
            conditionCode: null,
            conditionMain: null,
            description: null,
            icon: null,
            windDirection: 361,
            windSpeed: 5,
            gust: 6,
            waveHeight: null,
            atmospherePressure: 1010,
            temperature: 28,
            waterTemp: null,
            visibility: 10000,
            owmUpdatedAt: "2026-08-05T04:30:00.000Z",
            updatedAt: new Date("2026-08-05T04:30:00.000Z")
        })
    });
    t.after(() => { (PointWeatherCacheModel as any).findOne = originalFindOne; });

    const hit = await new MongoPointWeatherCache().read({ lat: 10, lon: 106 });

    assert.equal(hit?.value.windDirection, null);
});

test("treats an out-of-range wind direction from the buoy-weather cache as unavailable", async (t) => {
    const originalFindOne = BuoyWeatherCacheModel.findOne;
    (BuoyWeatherCacheModel as any).findOne = () => ({
        lean: async () => ({
            buoyId: "46042",
            windDirection: 361,
            windSpeed: 5,
            gust: 6,
            waveHeight: 1,
            atmospherePressure: 1010,
            temperature: 28,
            waterTemp: 25,
            visibility: 10000,
            updatedAt: "2026-08-05T04:30:00.000Z",
            cachedAt: new Date("2026-08-05T04:30:00.000Z")
        })
    });
    t.after(() => { (BuoyWeatherCacheModel as any).findOne = originalFindOne; });

    const hit = await new MongoBuoyWeatherCache().read({ buoyId: "46042" });

    assert.equal(hit?.value.windDirection, null);
});
