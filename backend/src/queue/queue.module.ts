import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  QUEUE_EMAIL,
  QUEUE_PDF,
  QUEUE_BACKUP,
} from './queue.constants';

/**
 * Shared BullMQ wiring.
 *
 * Uses a single Redis connection for all queues and workers.
 * Connection settings come from env:
 *   REDIS_URL (e.g. redis://:password@host:6379/0)
 *   - or -
 *   REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB
 *
 * Marked @Global so any module can inject queues via @InjectQueue(name).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        if (url) {
          return {
            connection: {
              // ioredis accepts a URL via the `path` of the host-string; easier
              // to parse it ourselves.
              ...parseRedisUrl(url),
              maxRetriesPerRequest: null,
            },
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: { age: 3600, count: 500 },
              removeOnFail: { age: 24 * 3600, count: 500 },
            },
          };
        }
        return {
          connection: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: parseInt(config.get<string>('REDIS_PORT', '6379'), 10),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            db: parseInt(config.get<string>('REDIS_DB', '0'), 10),
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: { age: 3600, count: 500 },
            removeOnFail: { age: 24 * 3600, count: 500 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_EMAIL },
      { name: QUEUE_PDF },
      { name: QUEUE_BACKUP },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}

function parseRedisUrl(url: string) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
      username: u.username || undefined,
      db: u.pathname && u.pathname.length > 1
        ? parseInt(u.pathname.slice(1), 10)
        : 0,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}
