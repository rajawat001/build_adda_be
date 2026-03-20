const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function formatLog(level, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };

  // In production, output JSON for log aggregation
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry);
  }

  // In development, output human-readable
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
}

const logger = {
  debug: (msg, meta) => { if (currentLevel <= 0) console.log(formatLog('debug', msg, meta)); },
  info: (msg, meta) => { if (currentLevel <= 1) console.log(formatLog('info', msg, meta)); },
  warn: (msg, meta) => { if (currentLevel <= 2) console.warn(formatLog('warn', msg, meta)); },
  error: (msg, meta) => { if (currentLevel <= 3) console.error(formatLog('error', msg, meta)); },
};

module.exports = logger;
