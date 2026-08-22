# Soosky Weather Marine API

## Local run

1. Copy `.env.example` to `.env` and set the required provider keys and `MONGO_URI`.
2. Run `npm install`, then `npm run build`.
3. Start the two processes in separate terminals:

   ```powershell
   npm.cmd start          # API  -> dist/app.js
   npm.cmd run start:worker   # buoy sync worker -> dist/buoy-sync.js
   ```

The API listens on `127.0.0.1:3002` by default (`HTTP_HOST`/`HTTP_PORT`); the
`buoy-sync` worker never exposes HTTP or any ports. The existing GET API contract and
frontend integration remain unchanged.

`npm run dev` runs the API only, with watch mode.

## Validation

Run:

```powershell
npm.cmd test -- --test-concurrency=1
npm.cmd run build
node scripts/assert-build-output.mjs
```

After starting the worker, confirm it has completed a sync — it logs
`Buoy sync complete: total=... created=... changed=... unchanged=...` once per cycle.

Worker settings use `MONGO_MAX_POOL_SIZE`, `NDBC_FETCH_TIMEOUT_MS`, `NDBC_FETCH_RETRIES`,
`SYNC_INTERVAL_MS`, and `SYNC_RUN_ON_BOOT`.

## VPS rollout

Two long-lived Node processes, both run from the repo root so `dotenv` can find `.env`:

| Process | Command | Ports |
|---|---|---|
| API | `node dist/app.js` | `127.0.0.1:3002` |
| Buoy sync worker | `node dist/buoy-sync.js` | none |

1. Deploy the code and its `.env` values, then build. Build needs devDependencies
   (`typescript`, `esbuild`), so do not `--omit=dev` here:

   ```bash
   git pull
   npm ci
   npm run build
   ```

   `npm run build` typechecks with `tsc --noEmit`, emits both bundles, and asserts they
   exist. Note the bundles use `--packages=external`, so `node_modules` must stay next to
   `dist/` at runtime — you cannot ship `dist/` alone.

2. Start the worker first and wait for its completion log before cutting over the API:

   ```bash
   node dist/buoy-sync.js
   ```

   Wait for `Buoy sync complete: total=... created=... changed=... unchanged=...`.

3. Start the API and verify:

   ```bash
   node dist/app.js
   curl -f http://127.0.0.1:3002/health
   ```

4. Put the two processes under a process manager so they survive crashes and reboots,
   and front the API with nginx (`proxy_pass http://127.0.0.1:3002`). The app sets
   `trust proxy = 1`, so the proxy must forward `X-Forwarded-For` for per-IP rate
   limiting to key on the real client.

   Run the worker as a **single instance**. Two concurrent workers would write the
   `buoys` collection at the same time.
