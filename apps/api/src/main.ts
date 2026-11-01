import { createApplication } from './http/application.js';

try {
  const portText = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(portText) || !Number.isSafeInteger(Number(portText)) || Number(portText) > 65535) throw new Error('PORT must be an integer from 0 through 65535');
  const app = await createApplication(process.env.DATABASE_PATH ?? 'fleet-floor.sqlite');
  try {
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
    await app.listen(Number(portText), process.env.HOST ?? '127.0.0.1');
    console.log(`Listening on ${await app.getUrl()}`);
  } catch (error) { await app.close(); throw error; }
} catch (error) {
  console.error(`API startup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
}
