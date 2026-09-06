import 'dotenv/config';
import { createApp } from './app';
import { initializeCatalogue } from '@/features/eligibility';

const configuredPort = Number(process.env.PORT);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3001;

/*
 * A no-op await when the JSON-backed catalogue is active (the default) — it has nothing to load.
 * When DATABASE_BACKED_CATALOGUE is on, this is the one real load from Postgres, done once here so
 * every request handler can keep calling programById()/criteriaFor()/scorablePrograms()
 * synchronously, same as always.
 */
initializeCatalogue()
  .then(() => {
    createApp().listen(port, () => {
      console.log(`Benefits backend listening at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize the eligibility catalogue:', error);
    process.exit(1);
  });
