import { Test, type TestingModule } from "@nestjs/testing";
import { RedisService } from "../../redis/redis.service";
import { GUEST_CONFIG } from "../constants";
import { GuestRepository } from "./guest.repository";

describe("GuestRepository", () => {
  let repository: GuestRepository;

  const mockRedisClient = {
    hgetall: jest.fn(),
    hset: jest.fn(),
    expire: jest.fn(),
    hincrby: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn().mockReturnValue(mockRedisClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GuestRepository, { provide: RedisService, useValue: mockRedisService }],
    }).compile();

    repository = module.get<GuestRepository>(GuestRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getGuestInfo", () => {
    it("게스트 정보가 있으면 파싱하여 반환해야 한다", async () => {
      mockRedisClient.hgetall.mockResolvedValue({
        remainingUses: "3",
        createdAt: "1700000000000",
      });

      const result = await repository.getGuestInfo("hashed-ip-value");

      expect(result).toEqual({
        remainingUses: 3,
        createdAt: 1700000000000,
      });
      expect(mockRedisClient.hgetall).toHaveBeenCalledWith("guest:hashed-ip-value");
    });

    it("데이터가 없으면 null을 반환해야 한다", async () => {
      mockRedisClient.hgetall.mockResolvedValue(null);

      const result = await repository.getGuestInfo("hashed-ip-value");

      expect(result).toBeNull();
    });

    it("빈 객체면 null을 반환해야 한다", async () => {
      mockRedisClient.hgetall.mockResolvedValue({});

      const result = await repository.getGuestInfo("hashed-ip-value");

      expect(result).toBeNull();
    });
  });

  describe("setGuestInfo", () => {
    const guestInfo = { remainingUses: 3, createdAt: 1700000000000 };

    it("Redis Hash에 게스트 정보를 저장해야 한다", async () => {
      await repository.setGuestInfo("hashed-ip-value", guestInfo);

      expect(mockRedisClient.hset).toHaveBeenCalledWith("guest:hashed-ip-value", {
        remainingUses: "3",
        createdAt: "1700000000000",
      });
    });

    it("기본 TTL을 설정해야 한다", async () => {
      await repository.setGuestInfo("hashed-ip-value", guestInfo);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        "guest:hashed-ip-value",
        GUEST_CONFIG.TTL_SECONDS,
      );
    });

    it("커스텀 TTL을 적용해야 한다", async () => {
      const customTtl = 3600;

      await repository.setGuestInfo("hashed-ip-value", guestInfo, customTtl);

      expect(mockRedisClient.expire).toHaveBeenCalledWith("guest:hashed-ip-value", customTtl);
    });
  });

  describe("decrementRemainingUses", () => {
    it("hincrby -1로 차감해야 한다", async () => {
      mockRedisClient.hincrby.mockResolvedValue(2);

      await repository.decrementRemainingUses("hashed-ip-value");

      expect(mockRedisClient.hincrby).toHaveBeenCalledWith(
        "guest:hashed-ip-value",
        "remainingUses",
        -1,
      );
    });

    it("차감 후 남은 값을 반환해야 한다", async () => {
      mockRedisClient.hincrby.mockResolvedValue(2);

      const result = await repository.decrementRemainingUses("hashed-ip-value");

      expect(result).toBe(2);
    });
  });
});
