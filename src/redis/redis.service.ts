import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    if (!redisUrl) {
      throw new Error("REDIS_URL is not defined in environment variables");
    }
    this.client = new Redis(redisUrl);

    // Redis 연결 이벤트 핸들러
    this.client.on("connect", () => {
      this.logger.log("Redis 연결 성공");
    });

    this.client.on("error", (error) => {
      this.logger.error(`Redis 연결 오류: ${error.message}`);
    });

    this.client.on("close", () => {
      this.logger.warn("Redis 연결 끊김");
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
    this.logger.log("Redis 연결 종료");
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs) {
      await this.client.set(key, value, "PX", ttlMs);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
