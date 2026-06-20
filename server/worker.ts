// MUST be first — sets the process timezone before any Date operations
process.env.TZ = 'America/Edmonton';
import { initBackgroundJobs } from './background-jobs';
import { logger, logEvent } from './logger';
logger.info({ event: 'worker_start' }, 'Worker process starting');
initBackgroundJobs();
logger.info({ event: 'worker_ready' }, 'Worker process ready — cron jobs active');
process.on('SIGTERM', () => {
  logger.info({ event: 'worker_shutdown', signal: 'SIGTERM' }, 'Worker shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info({ event: 'worker_shutdown', signal: 'SIGINT' }, 'Worker shutting down');
  process.exit(0);
});
process.on('uncaughtException', (error) => {
  logEvent.error('worker_uncaught_exception', error);
  setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason) => {
  logEvent.error('worker_unhandled_rejection', reason);
});
