# Soosky Weather Marine API

## Local run

1. Copy `.env.example` to `.env` and set the required provider keys and `MONGO_URI`.
2. Run `npm install`, then `npm run build`.
3. Start both services with `docker compose up -d --build api buoy-sync`.

The API remains available on `127.0.0.1:3002`; the `buoy-sync` worker never exposes HTTP or any ports. The existing GET API contract and frontend integration remain unchanged.

## Validation

Run:

```powershell
npm.cmd test -- --test-concurrency=1
npm.cmd run build
node scripts/assert-build-output.mjs
docker compose config --quiet
```

After startup, confirm the worker has completed a sync:

```powershell
docker compose logs buoy-sync
```

Its successful run is logged as `Buoy sync complete: total=... created=... changed=... unchanged=...`.

Worker settings use `MONGO_MAX_POOL_SIZE`, `NDBC_FETCH_TIMEOUT_MS`, `NDBC_FETCH_RETRIES`, `SYNC_INTERVAL_MS`, and `SYNC_RUN_ON_BOOT`. Numeric values must be integers; pool size, fetch timeout, and sync interval must be greater than zero, while retries may be zero.

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

4. Only after the worker completion log and Docker API health check succeed, check for the known legacy scheduler `soosky-bot-weather-marine`. If the pre-check succeeds, stop and delete only that process, then save the PM2 process list:

   ```powershell
   pm2 describe soosky-bot-weather-marine
   if ($LASTEXITCODE -eq 0) {
       pm2 stop soosky-bot-weather-marine
       pm2 delete soosky-bot-weather-marine
       pm2 save
   }
   ```

Do not use a blanket PM2 deletion command. Identify the intended scheduler first and stop only that known process.
