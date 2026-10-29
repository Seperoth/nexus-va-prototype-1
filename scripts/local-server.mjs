import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, createServer } from 'vite';

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const logDirectory = join(projectDirectory, '.local');
mkdirSync(logDirectory, { recursive: true });
const log = (level, message) => {
  appendFileSync(
    join(logDirectory, 'local-server.log'),
    `${new Date().toISOString()} [${level}] ${message}\n`,
  );
};

const logger = createLogger('info', { allowClearScreen: false });
for (const level of ['info', 'warn', 'error']) {
  const original = logger[level].bind(logger);
  logger[level] = (message, options) => {
    log(level.toUpperCase(), message);
    original(message, options);
  };
}

let server;
let stopping = false;
async function stop(reason, code = 0) {
  if (stopping) return;
  stopping = true;
  log('STOP', reason);
  try {
    await server?.close();
  } finally {
    process.exit(code);
  }
}

process.on('SIGINT', () => void stop('Received SIGINT'));
process.on('SIGTERM', () => void stop('Received SIGTERM'));
process.on('uncaughtException', (error) => void stop(error.stack || String(error), 1));
process.on('unhandledRejection', (error) => void stop(String(error), 1));
process.on('exit', (code) => log('EXIT', `Process ${process.pid}, code ${code}`));

try {
  log('START', `Process ${process.pid}; Node ${process.version}`);
  server = await createServer({
    root: projectDirectory,
    customLogger: logger,
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  });
  await server.listen();
  writeFileSync(join(logDirectory, 'local-server.pid'), String(process.pid));
  log('READY', 'http://127.0.0.1:5173/');
} catch (error) {
  await stop(error instanceof Error ? error.stack : String(error), 1);
}
