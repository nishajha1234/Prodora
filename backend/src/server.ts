import { app } from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.BACKEND_PORT, () => {
  console.info(`Prodora API listening on http://localhost:${env.BACKEND_PORT}`);
});

function shutdown(signal: string): void {
  console.info(`${signal} received. Closing the API server.`);
  server.close((error) => {
    if (error) {
      console.error('The API server could not close cleanly.', error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
