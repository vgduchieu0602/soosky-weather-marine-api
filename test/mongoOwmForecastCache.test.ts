import assert from "node:assert/strict";
import test from "node:test";
import config from "../src/config";
import MongoOwmForecastCache from "../src/adapters/mongo/stores/MongoOwmForecastCache";
import OwmForecastCacheModel from "../src/adapters/mongo/models/OwmForecastCacheModel";

type ForecastSourceConfig = {forecastSource?: "free-3h" | "pro-hourly"};

test("reads the forecast location timezone offset from cache", async (t) => {
    const originalFindOne = OwmForecastCacheModel.findOne;
    (OwmForecastCacheModel as any).findOne = () => ({
        lean: async () => ({
            lat: 37.759,
            lon: -122.833,
            hourly: [],
            daily: [],
            timezoneOffsetSeconds: -7 * 60 * 60,
            forecastSource: config.owm.forecastSource,
            updatedAt: new Date("2026-08-05T04:30:00.000Z")
        })
    });
    t.after(() => { (OwmForecastCacheModel as any).findOne = originalFindOne; });

    const hit = await new MongoOwmForecastCache().read({ lat: 37.759, lon: -122.833 });

    assert.equal(hit?.value.timezoneOffsetSeconds, -7 * 60 * 60);
});

test("treats a legacy forecast cache document without a timezone offset as a cache miss", async (t) => {
    const originalFindOne = OwmForecastCacheModel.findOne;
    (OwmForecastCacheModel as any).findOne = () => ({
        lean: async () => ({
            lat: 37.759,
            lon: -122.833,
            hourly: [],
            daily: [],
            forecastSource: config.owm.forecastSource,
            updatedAt: new Date("2026-08-05T04:30:00.000Z")
        })
    });
    t.after(() => { (OwmForecastCacheModel as any).findOne = originalFindOne; });

    const hit = await new MongoOwmForecastCache().read({ lat: 37.759, lon: -122.833 });

    assert.equal(hit, null);
});

test("writes the forecast location timezone offset to cache", async (t) => {
    const originalFindOneAndUpdate = OwmForecastCacheModel.findOneAndUpdate;
    let update: any;
    (OwmForecastCacheModel as any).findOneAndUpdate = async (_query: unknown, patch: unknown) => {
        update = patch;
    };
    t.after(() => { (OwmForecastCacheModel as any).findOneAndUpdate = originalFindOneAndUpdate; });

    await new MongoOwmForecastCache().write(
        { lat: 37.759, lon: -122.833 },
        {
            lat: 37.759,
            lon: -122.833,
            hourly: [],
            daily: [],
            timezoneOffsetSeconds: -7 * 60 * 60,
            updatedAt: "2026-08-05T04:30:00.000Z"
        }
    );

    assert.equal(update.$set.timezoneOffsetSeconds, -7 * 60 * 60);
    assert.equal(update.$set.forecastSource, config.owm.forecastSource);
});

test("treats a forecast cached by another source mode as a cache miss", async (t) => {
    const sourceConfig = config.owm as ForecastSourceConfig;
    const originalSource = sourceConfig.forecastSource;
    sourceConfig.forecastSource = "pro-hourly";
    const originalFindOne = OwmForecastCacheModel.findOne;
    (OwmForecastCacheModel as any).findOne = () => ({
        lean: async () => ({
            lat: 37.759,
            lon: -122.833,
            hourly: [],
            daily: [],
            timezoneOffsetSeconds: -7 * 60 * 60,
            forecastSource: "free-3h",
            updatedAt: new Date("2026-08-05T04:30:00.000Z")
        })
    });
    t.after(() => {
        (OwmForecastCacheModel as any).findOne = originalFindOne;
        sourceConfig.forecastSource = originalSource;
    });

    const hit = await new MongoOwmForecastCache().read({lat: 37.759, lon: -122.833});

    assert.equal(hit, null);
});
