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

1. Deploy the new code and its `.env` values, then build the shared image without starting either service:

   ```powershell
   docker compose build
   ```

2. Start the no-port worker while the existing PM2 API continues to hold port 3002, then inspect its logs:

   ```powershell
   docker compose up -d buoy-sync
   docker compose logs --tail=100 buoy-sync
   ```

   Wait for `Buoy sync complete: total=... created=... changed=... unchanged=...` before continuing.

3. Identify `weather-marine-api` in `pm2 status`. It is the old API process, not the legacy buoy scheduler. During the controlled port-3002 cutover, stop only that identified API process and immediately start and verify Docker `api`:

   ```powershell
   pm2 stop weather-marine-api
   docker compose up -d api
   docker compose ps api
   curl.exe -f http://127.0.0.1:3002/health
   ```

4. Only after the worker completion log and Docker API health check succeed, retire the legacy buoy scheduler using its known, explicitly identified process or service name.

Do not use a blanket PM2 deletion command. Identify the intended scheduler first and stop only that known process.
