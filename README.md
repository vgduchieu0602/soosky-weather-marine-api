# Soosky Weather Marine API

## Local run

1. Copy `.env.example` to `.env` and set the required provider keys and `MONGO_URI`.
2. Run `npm install`, then `npm run build`.
3. Start both services with `docker compose up -d --build api buoy-sync`.

The API remains available on `127.0.0.1:3002`; the `buoy-sync` worker never exposes HTTP or any ports. The existing GET API contract and frontend integration remain unchanged.

## Validation

Run:

```powershell
npm.cmd test
npm.cmd run build
if (!(Test-Path 'dist/app.js') -or !(Test-Path 'dist/buoy-sync.js')) { throw 'Both API and worker bundles must exist.' }
docker compose config
```

After startup, confirm the worker has completed a sync:

```powershell
docker compose logs buoy-sync
```

Its successful run is logged as `Buoy sync complete: total=... created=... changed=... unchanged=...`.

## VPS rollout

1. Deploy the new code and its `.env` values, then build and start both services together: `docker compose up -d --build api buoy-sync`.
2. Inspect `docker compose logs buoy-sync` and wait for the successful completion log above.
3. Only after that verification, retire the legacy buoy scheduler using its known, explicitly identified process or service name.
4. During the controlled switch to Docker API, stop `weather-marine-api` PM2 only if it is holding port 3002. It is the old API process, not the legacy buoy scheduler.

Do not use a blanket PM2 deletion command: identify the intended legacy scheduler first, and stop only that known process. Keep the prior API process available until the Docker `api` service is ready to take over port 3002.
