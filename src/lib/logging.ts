import pino from 'pino';

const REDACT_PATHS = [
  // API keys anywhere in the log payload
  '*.apiKey',
  '*.api_key',
  '*.["X-API-KEY"]',
  '*.["x-api-key"]',
  'req.headers["x-api-key"]',
  'headers["x-api-key"]',
  // Common PII fields surfacing through LettrLabs API responses
  '*.email',
  '*.firstName',
  '*.lastName',
  '*.phoneNumber',
  '*.address',
  '*.address1',
  '*.address2',
  '*.zipCode',
];

export const logger = pino({
  name: process.env.OTEL_SERVICE_NAME ?? 'lettrlabs-publicapi-mcp',
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
