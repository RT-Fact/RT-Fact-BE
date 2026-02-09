import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { AppService } from "./app.service";
import { Public } from "./common/decorators/public.decorator";
import { PrismaService } from "./prisma/prisma.service";
import { RedisService } from "./redis/redis.service";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("health")
  @Public()
  async healthCheck(): Promise<{ status: string; version: string }> {
    try {
      // DB 연결 확인
      await this.prismaService.$queryRaw`SELECT 1`;

      // Redis 연결 확인
      const redisClient = this.redisService.getClient();
      await redisClient.ping();

      return { status: "ok", version: "0.0.1" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      throw new ServiceUnavailableException({
        status: "error",
        reason,
      });
    }
  }
}
