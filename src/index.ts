import { logger } from './lib/logging.js';
import { createApp, SERVER_NAME, SERVER_VERSION } from './server.js';

const PORT = Number(process.env.PORT ?? 3333);
const LETTRLABS_API_BASE_URL = process.env.LETTRLABS_API_BASE_URL;

if (!LETTRLABS_API_BASE_URL) {
  logger.fatal('LETTRLABS_API_BASE_URL env var is required (e.g. https://app-dev.lettrlabs.com)');
  process.exit(1);
}

const app = createApp({ lettrlabsApiBaseUrl: LETTRLABS_API_BASE_URL });

const httpServer = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      service: SERVER_NAME,
      version: SERVER_VERSION,
      lettrlabsApiBaseUrl: LETTRLABS_API_BASE_URL,
    },
    'MCP server listening',
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  httpServer.close((err) => {
    if (err) {
      logger.error({ err: err.message }, 'error during shutdown');
      process.exit(1);
    }
    logger.info('server closed cleanly');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('forcing shutdown after 10s grace period');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason: String(reason) }, 'unhandled promise rejection');
  process.exit(1);
});
