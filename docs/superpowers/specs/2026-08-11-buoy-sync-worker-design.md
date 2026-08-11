# Buoy Sync Worker Integration Design

## Context

`soosky-bot-weather-marine` currently runs a scheduler that downloads the NDBC active-stations feed and synchronizes the shared MongoDB `buoys` collection. The Weather Marine API already reads that collection for map markers and buoy enrichment, and falls back to NDBC only when the collection is empty.

## Goal

Move the scheduled buoy synchronization into `soosky-weather-marine-api` while preserving every existing HTTP endpoint and response shape used by the frontend.

## Non-goals

- Change any API route, JSON field, response formatter, or frontend behavior.
- Change the MongoDB `buoys` schema or collection name.
- Run a scheduler inside the Express API process.
- Run the legacy PM2 bot and the new worker concurrently.

## Architecture

The repository will produce two independent Node entrypoints from the same source tree:

```text
api service         -> dist/app.js             -> HTTP API
buoy-sync service   -> dist/buoy-sync.js       -> scheduled NDBC synchronization
MongoDB Atlas       -> shared `buoys` collection
```

The API remains responsible for reads and best-effort cold-start seeding. The worker is the authoritative writer for the NDBC station directory.

## Components

### Shared NDBC source

Extend the existing NDBC station source so the worker can configure feed URL, timeout, and retry count. It continues to parse one `activestations.xml` response into `{ buoyId, name, lat, lon }` records.

### Synchronization port and use case

Add a write-focused `BuoyStationSyncStore` port and `SyncBuoyStationsUseCase`. The use case reads the whole active-station feed, rejects an empty feed to protect existing data, and delegates a change-detected bulk upsert.

### Mongo synchronization adapter

Add a Mongo adapter that writes to the existing `buoys` collection and preserves its current contract:

- New station: set `source`, `firstSeenAt`, `lastSeenAt`, and `changedAt`.
- Changed name or coordinates: update values, `lastSeenAt`, and `changedAt`.
- Unchanged station: update only `lastSeenAt`.

The existing API read store and lazy-seed behavior remain unchanged.

### Worker entrypoint and scheduler

Add `src/workers/buoySync.ts` as a composition root. It connects Mongo, schedules the use case with run-on-boot and overlap protection, logs one sync summary per run, and handles SIGINT/SIGTERM by stopping the scheduler and disconnecting Mongo.

### Configuration and deployment

Add worker-only configuration, with defaults matching the legacy bot:

- `NDBC_ACTIVE_STATIONS_URL`
- `NDBC_FETCH_TIMEOUT_MS` (20 seconds)
- `NDBC_FETCH_RETRIES` (3)
- `SYNC_INTERVAL_MS` (24 hours)
- `SYNC_RUN_ON_BOOT` (`true`)
- `MONGO_MAX_POOL_SIZE` (5, used by the worker connection)

`docker-compose.yml` adds a `buoy-sync` service using the same image, `.env`, and MongoDB as `api`, but its command is `node dist/buoy-sync.js`. The API service continues to use `node dist/app.js`.

## Data Flow

```text
NDBC activestations.xml
  -> NdbcStationSource
  -> SyncBuoyStationsUseCase
  -> MongoBuoyStationSyncStore
  -> MongoDB `buoys`
  -> existing API repositories/use cases
  -> existing HTTP response to FE
```

## Failure Handling

- NDBC timeout or request failure: retry with bounded backoff; retain existing Mongo data.
- Empty parsed feed: fail the sync run and retain existing Mongo data.
- Overlapping interval: skip the next run while one is active.
- Mongo connection failure: worker exits so Docker restart policy retries it.
- API behavior is unchanged; it retains its existing DB read and fallback behavior.

## Testing

- Unit test the sync use case for new, changed, unchanged, empty-feed, and source-failure cases.
- Unit test scheduler overlap protection and run-on-boot behavior.
- Unit test configured NDBC retry/timeout behavior.
- Build both output entrypoints and confirm the existing API suite stays green.

## Rollout

1. Deploy the API repository with the new `buoy-sync` service.
2. Confirm worker startup and one successful `[sync]` log line.
3. Stop and delete the legacy `soosky-bot-weather-marine` PM2 process.
4. Confirm `buoys` records continue receiving `lastSeenAt` updates.
5. Keep the API contract unchanged throughout; no frontend deployment is needed.

## Decision

Use one repository with two independent Docker services, rather than embedding the scheduler in the Express process or retaining a separate bot repository.

## Trade-offs

- A second container consumes a small amount of memory, but prevents duplicate syncs when API instances scale and isolates scheduler failures from request serving.
- Exact API response compatibility is preserved, but deployment must retire the legacy PM2 bot to avoid concurrent writers.
