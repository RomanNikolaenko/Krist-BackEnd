/**
 * A real PostgreSQL, downloaded and run as a child process.
 *
 * For machines without Docker. It is the same server the compose file starts,
 * just supervised by node instead — so migrations, constraints and transactions
 * all behave exactly as they will in production, which a fake in-memory
 * database could not promise.
 *
 *   node scripts/local-postgres.mjs          # start and stay in the foreground
 *   node scripts/local-postgres.mjs --stop   # stop and leave the data behind
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), '.local', 'postgres');
const PORT = 5432;

mkdirSync(DATA_DIR, { recursive: true });

const postgres = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'krist',
  password: 'krist',
  port: PORT,
  persistent: true,
});

async function start() {
  // initialise() is only for a fresh directory; on a second run the cluster is
  // already there and re-initialising would wipe it.
  try {
    await postgres.initialise();
    console.log('cluster created');
  } catch {
    console.log('cluster already present, reusing it');
  }

  await postgres.start();

  try {
    await postgres.createDatabase('krist');
    console.log('database "krist" created');
  } catch {
    console.log('database "krist" already exists');
  }

  console.log(`postgres listening on ${PORT} — data in ${DATA_DIR}`);

  const shutdown = () => {
    void postgres.stop().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv.includes('--stop')) {
  await postgres.stop();
  console.log('postgres stopped');
} else {
  await start();
}
