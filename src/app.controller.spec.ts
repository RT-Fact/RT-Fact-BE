import { ServiceUnavailableException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaService } from "./prisma/prisma.service";
import { RedisService } from "./redis/redis.service";

describe("AppController", () => {
  let appController: AppController;
  let mockQueryRaw: jest.Mock;
  let mockGetClient: jest.Mock;
  let mockRedisPing: jest.Mock;

  beforeEach(async () => {
    mockQueryRaw = jest.fn().mockResolvedValue([{ 1: 1 }]);
    mockRedisPing = jest.fn().mockResolvedValue("PONG");

    const mockPrismaService = {
      $queryRaw: mockQueryRaw,
    };

    const mockRedisClient = {
      ping: mockRedisPing,
    };

    mockGetClient = jest.fn().mockReturnValue(mockRedisClient);

    const mockRedisService = {
      getClient: mockGetClient,
    };

    const mockAppService = {
      getHello: jest.fn().mockReturnValue("Hello World!"),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: mockAppService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("root", () => {
    it('"Hello World!"를 반환해야 한다', () => {
      expect(appController.getHello()).toBe("Hello World!");
    });
  });

  describe("healthCheck (헬스 체크)", () => {
    it('DB와 Redis가 정상일 때 status "ok"를 반환해야 한다', async () => {
      const result = await appController.healthCheck();
      expect(result).toEqual({ status: "ok", version: "0.0.1" });

      expect(mockQueryRaw).toHaveBeenCalled();
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockRedisPing).toHaveBeenCalled();
    });

    it("DB 연결 실패 시 ServiceUnavailableException을 던져야 한다", async () => {
      mockQueryRaw.mockRejectedValueOnce(new Error("DB connection failed"));

      await expect(appController.healthCheck()).rejects.toThrow(ServiceUnavailableException);
    });

    it("Redis 연결 실패 시 ServiceUnavailableException을 던져야 한다", async () => {
      mockRedisPing.mockRejectedValueOnce(new Error("Redis connection failed"));

      await expect(appController.healthCheck()).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
