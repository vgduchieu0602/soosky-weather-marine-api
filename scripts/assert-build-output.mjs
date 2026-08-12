import { access } from 'node:fs/promises';

const bundles = ['dist/app.js', 'dist/buoy-sync.js'];
const missingBundles = [];

for (const bundle of bundles) {
  try {
    await access(bundle);
  } catch {
    missingBundles.push(bundle);
  }
}

if (missingBundles.length > 0) {
  throw new Error(`Missing build output: ${missingBundles.join(', ')}`);
}
