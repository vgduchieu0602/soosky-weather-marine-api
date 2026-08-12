import assert from 'node:assert/strict'
import test from 'node:test'
import StationLocatorImpl from '../src/adapters/station/StationLocator'
import {haversineKm} from '../src/domain/utils/haversine'

type Station = { id: string; lat: number; lon: number }

// ~111.19 km / độ lat tại xích đạo -> lat 0.1 ≈ 11.1 km, lat 2 ≈ 222 km.
const seed = (locator: StationLocatorImpl, field: '_tide' | '_buoy', stations: Station[]) => {
    (locator as any)[field] = { at: Date.now(), stations }
}

const nearestList = (stations: Station[], lat: number, lon: number, maxKm: number, limit: number) =>
    (new StationLocatorImpl() as any)._nearestList(stations, lat, lon, maxKm, limit)

// Pipeline cũ, giữ lại trong test làm oracle để so sánh output.
const legacyNearestList = (stations: Station[], lat: number, lon: number, maxKm: number, limit: number) =>
    stations
        .map((s) => ({ id: s.id, distanceKm: haversineKm(lat, lon, s.lat, s.lon) }))
        .filter((s) => s.distanceKm <= maxKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit)

test('nearestTideStations returns the 3 nearest stations sorted near -> far', async () => {
    const locator = new StationLocatorImpl()
    seed(locator, '_tide', [
        { id: 'far', lat: 0.5, lon: 0 },
        { id: 'closest', lat: 0.1, lon: 0 },
        { id: 'third', lat: 0.3, lon: 0 },
        { id: 'second', lat: 0.2, lon: 0 }
    ])

    const result = await locator.nearestTideStations(0, 0)

    assert.deepEqual(result.map((s) => s.id), ['closest', 'second', 'third'])
    assert.ok(result[0]!.distanceKm < result[1]!.distanceKm)
    assert.ok(result[1]!.distanceKm < result[2]!.distanceKm)
})

test('drops stations beyond maxKm and never exceeds the limit', async () => {
    const tideLocator = new StationLocatorImpl()
    const buoyLocator = new StationLocatorImpl()
    const stations: Station[] = [
        { id: 'in-150', lat: 1, lon: 0 },        // ≈111 km
        { id: 'in-200', lat: 1.5, lon: 0 },      // ≈167 km
        { id: 'out', lat: 2, lon: 0 },           // ≈222 km
        { id: 'near-a', lat: 0.1, lon: 0 },
        { id: 'near-b', lat: 0.2, lon: 0 },
        { id: 'near-c', lat: 0.3, lon: 0 }
    ]
    seed(tideLocator, '_tide', stations)
    seed(buoyLocator, '_buoy', stations)

    const tide = await tideLocator.nearestTideStations(0, 0)
    const buoy = await buoyLocator.nearestBuoyStations(0, 0)

    assert.equal(tide.length, 3)
    assert.equal(buoy.length, 3)
    for (const s of tide) assert.ok(s.distanceKm <= 150)
    for (const s of buoy) assert.ok(s.distanceKm <= 200)
    // Trạm ngoài bán kính không bao giờ lọt vào kết quả.
    assert.deepEqual(nearestList(stations, 0, 0, 150, 10).map((s: any) => s.id), ['near-a', 'near-b', 'near-c', 'in-150'])
    assert.deepEqual(nearestList(stations, 0, 0, 200, 10).map((s: any) => s.id), ['near-a', 'near-b', 'near-c', 'in-150', 'in-200'])
})

test('returns an empty list when every station is out of range', () => {
    assert.deepEqual(nearestList([{ id: 'far', lat: 20, lon: 20 }], 0, 0, 150, 3), [])
    assert.deepEqual(nearestList([], 0, 0, 150, 3), [])
})

test('matches the previous map/filter/sort/slice output on random directories', () => {
    // LCG cố định -> dataset lặp lại được, test không flaky.
    let s = 123456789
    const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }

    for (const limit of [1, 3, 5]) {
        for (const maxKm of [150, 200, 5000]) {
            const stations: Station[] = []
            for (let i = 0; i < 500; i++) {
                // Trùng toạ độ có chủ đích (i % 7 === 0) để kiểm tra tie-break giữ thứ tự gốc.
                const dup = i % 7 === 0
                stations.push({
                    id: `s${i}`,
                    lat: dup ? 1 : (rand() * 8) - 4,
                    lon: dup ? 1 : (rand() * 8) - 4
                })
            }
            assert.deepEqual(
                nearestList(stations, 0.5, -0.5, maxKm, limit),
                legacyNearestList(stations, 0.5, -0.5, maxKm, limit),
                `limit=${limit} maxKm=${maxKm}`
            )
        }
    }
})
