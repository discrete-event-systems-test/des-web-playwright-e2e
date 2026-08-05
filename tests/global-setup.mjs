import fs from 'node:fs/promises';
import { startFixture } from './support/fixture.mjs';
import { resolveTarget } from './support/target.mjs';

export default async function globalSetup() {
  let target;
  if (process.env.DES_FORCE_FIXTURE === '1') {
    target = await startFixture();
  } else {
    try {
      target = await resolveTarget();
    } catch (error) {
      console.warn(`Deployed DES target unavailable; using verified fixture: ${error.message}`);
      target = await startFixture();
    }
  }
  process.env.DES_RESOLVED_BASE_URL = target.baseURL;
  process.env.DES_TARGET_MODE = target.mode;
  await fs.mkdir('test-results', { recursive: true });
  await fs.writeFile('test-results/target.json', `${JSON.stringify(target, null, 2)}\n`, 'utf8');
  console.log(`DES target: ${target.baseURL} (${target.mode}, HTTP ${target.probeStatus})`);
}
