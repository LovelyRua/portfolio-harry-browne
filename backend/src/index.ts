import 'dotenv/config';
import { buildServer } from './app';
import { assertProductionConfig, config } from './lib/config';

async function main() {
  assertProductionConfig();
  const app = buildServer();
  await app.listen({ port: config.port, host: config.host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
