import { stopFixture } from './support/fixture.mjs';

export default async function globalTeardown() {
  await stopFixture();
}
