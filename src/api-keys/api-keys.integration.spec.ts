import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { AuthenticatedUser } from "../auth/types/auth.types";
import { ERROR_CODES } from "../common/constants/error-codes";
import { RedisService } from "../redis/redis.service";
import { ApiKeysController } from "./api-keys.controller";
import { ApiKeysService } from "./api-keys.service";
import { API_KEY_CACHE_TTL, API_KEY_PREFIX, DEFAULT_MAX_API_KEYS } from "./constants";
import { ApiKeysRepository } from "./repositories/api-keys.repository";

interface MockApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  userId: string;
  createdAt: Date;
}

const createApiKeyRecord = (overrides?: Partial<MockApiKeyRecord>): MockApiKeyRecord => ({
  id: "key-1",
  name: "테스트 API 키",
  keyPrefix: "rtf_abcd1234",
  keyHash: "hashed",
  userId: "user-123",
  createdAt: new Date("2026-01-01"),
  ...overrides,
});

const createUser = (overrides?: Partial<AuthenticatedUser>): AuthenticatedUser => ({
  userId: "user-123",
  email: "test@example.com",
  isGuest: false as const,
  ...overrides,
});

describe("ApiKeysController + ApiKeysService Integration", () => {
  let controller: ApiKeysController;
  let service: ApiKeysService;

  const mockApiKeysRepository = {
    create: jest.fn(),
    findByUserId: jest.fn(),
    countByUserId: jest.fn(),
    findByPrefix: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        ApiKeysService,
        { provide: ApiKeysRepository, useValue: mockApiKeysRepository },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue("test-secret") } },
      ],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
    service = module.get<ApiKeysService>(ApiKeysService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    const user = createUser();
    const dto = { name: "새 API 키" };

    it("API 키를 생성하고 secretKey를 포함한 결과를 반환해야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(0);
      mockApiKeysRepository.create.mockResolvedValue(createApiKeyRecord({ name: dto.name }));

      const result = await controller.create(user, dto);

      expect(result.id).toBe("key-1");
      expect(result.name).toBe(dto.name);
      expect(typeof result.prefix).toBe("string");
      expect(result.secretKey).toMatch(new RegExp(`^${API_KEY_PREFIX}`));
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("repository.create에 userId와 해시된 키를 전달해야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(0);
      mockApiKeysRepository.create.mockResolvedValue(createApiKeyRecord({ name: dto.name }));

      await controller.create(user, dto);

      expect(mockApiKeysRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.userId,
          name: dto.name,
        }),
      );
    });

    it("한도 초과 시 ForbiddenException을 던져야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(DEFAULT_MAX_API_KEYS);

      await expect(controller.create(user, dto)).rejects.toThrow(
        new ForbiddenException(ERROR_CODES.API_KEY_LIMIT_EXCEEDED),
      );
    });

    it("한도 미만이면 정상적으로 생성해야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(DEFAULT_MAX_API_KEYS - 1);
      mockApiKeysRepository.create.mockResolvedValue(createApiKeyRecord({ name: dto.name }));

      const result = await controller.create(user, dto);

      expect(result.secretKey).toBeDefined();
      expect(mockApiKeysRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("findAll", () => {
    const user = createUser();

    it("사용자의 API 키 목록을 변환하여 반환해야 한다", async () => {
      const now = new Date();
      mockApiKeysRepository.findByUserId.mockResolvedValue([
        createApiKeyRecord({
          id: "key-1",
          name: "키 1",
          keyPrefix: "rtf_aaaa1111",
          createdAt: now,
        }),
        createApiKeyRecord({
          id: "key-2",
          name: "키 2",
          keyPrefix: "rtf_bbbb2222",
          createdAt: now,
        }),
      ]);

      const result = await controller.findAll(user);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "key-1",
        name: "키 1",
        prefix: "rtf_aaaa1111",
        createdAt: now,
      });
      expect(result[1]).toEqual({
        id: "key-2",
        name: "키 2",
        prefix: "rtf_bbbb2222",
        createdAt: now,
      });
    });

    it("keyHash를 응답에 포함하지 않아야 한다", async () => {
      mockApiKeysRepository.findByUserId.mockResolvedValue([
        createApiKeyRecord({ keyHash: "should_not_appear" }),
      ]);

      const result = await controller.findAll(user);

      expect(result[0]).not.toHaveProperty("keyHash");
      expect(result[0]).not.toHaveProperty("userId");
    });

    it("키가 없으면 빈 배열을 반환해야 한다", async () => {
      mockApiKeysRepository.findByUserId.mockResolvedValue([]);

      const result = await controller.findAll(user);

      expect(result).toEqual([]);
    });

    it("repository.findByUserId를 올바른 userId로 호출해야 한다", async () => {
      mockApiKeysRepository.findByUserId.mockResolvedValue([]);

      await controller.findAll(user);

      expect(mockApiKeysRepository.findByUserId).toHaveBeenCalledWith(user.userId);
    });
  });

  describe("remove", () => {
    const user = createUser();
    const keyId = "key-1";

    it("키를 삭제하고 { success: true }를 반환해야 한다", async () => {
      mockApiKeysRepository.findById.mockResolvedValue(createApiKeyRecord());
      mockApiKeysRepository.delete.mockResolvedValue(undefined);
      mockRedisService.del.mockResolvedValue(undefined);

      const result = await controller.remove(user, keyId);

      expect(result).toEqual({ success: true });
      expect(mockApiKeysRepository.delete).toHaveBeenCalledWith(keyId);
    });

    it("삭제 시 Redis 캐시도 함께 제거해야 한다", async () => {
      const prefix = "rtf_abcd1234";
      mockApiKeysRepository.findById.mockResolvedValue(createApiKeyRecord({ keyPrefix: prefix }));
      mockApiKeysRepository.delete.mockResolvedValue(undefined);
      mockRedisService.del.mockResolvedValue(undefined);

      await controller.remove(user, keyId);

      expect(mockRedisService.del).toHaveBeenCalledWith(`auth:apikey:${prefix}`);
    });

    it("존재하지 않는 키면 NotFoundException을 던져야 한다", async () => {
      mockApiKeysRepository.findById.mockResolvedValue(null);

      await expect(controller.remove(user, keyId)).rejects.toThrow(
        new NotFoundException(ERROR_CODES.API_KEY_NOT_FOUND),
      );
    });

    it("다른 사용자의 키면 NotFoundException을 던져야 한다", async () => {
      mockApiKeysRepository.findById.mockResolvedValue(
        createApiKeyRecord({ userId: "other-user" }),
      );

      await expect(controller.remove(user, keyId)).rejects.toThrow(
        new NotFoundException(ERROR_CODES.API_KEY_NOT_FOUND),
      );
    });
  });

  describe("verify", () => {
    it("유효한 API 키면 { valid: true, userId }를 반환해야 한다", async () => {
      const apiKey = "rtf_abcdef123456rest_of_key";
      const prefix = apiKey.substring(0, 12);
      const keyHash = service["hashKey"](apiKey);
      mockRedisService.get.mockResolvedValue(null);
      mockApiKeysRepository.findByPrefix.mockResolvedValue(
        createApiKeyRecord({ keyHash, keyPrefix: prefix, userId: "user-123" }),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await controller.verify({ key: apiKey });

      expect(result).toEqual({ valid: true, userId: "user-123" });
    });

    it("잘못된 접두사면 { valid: false }를 반환해야 한다", async () => {
      const result = await controller.verify({ key: "invalid_key_format" });

      expect(result).toEqual({ valid: false });
      expect(mockApiKeysRepository.findByPrefix).not.toHaveBeenCalled();
    });

    it("DB에 키가 없으면 { valid: false }를 반환해야 한다", async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockApiKeysRepository.findByPrefix.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await controller.verify({ key: "rtf_abcdef123456rest_of_key" });

      expect(result).toEqual({ valid: false });
    });

    it("해시 불일치면 { valid: false }를 반환해야 한다", async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockApiKeysRepository.findByPrefix.mockResolvedValue(
        createApiKeyRecord({
          keyHash: "a".repeat(64),
          keyPrefix: "rtf_abcdef12",
        }),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await controller.verify({ key: "rtf_abcdef123456rest_of_key" });

      expect(result).toEqual({ valid: false });
    });

    describe("캐시", () => {
      it("Redis 캐시 히트 시 DB를 조회하지 않아야 한다", async () => {
        const cachedResult = JSON.stringify({ valid: true, userId: "user-123" });
        mockRedisService.get.mockResolvedValue(cachedResult);

        const result = await controller.verify({ key: "rtf_abcdef123456rest_of_key" });

        expect(result).toEqual({ valid: true, userId: "user-123" });
        expect(mockApiKeysRepository.findByPrefix).not.toHaveBeenCalled();
      });

      it("검증 결과를 올바른 TTL로 캐시해야 한다", async () => {
        const apiKey = "rtf_abcdef123456rest_of_key";
        const prefix = apiKey.substring(0, 12);
        const keyHash = service["hashKey"](apiKey);
        mockRedisService.get.mockResolvedValue(null);
        mockApiKeysRepository.findByPrefix.mockResolvedValue(
          createApiKeyRecord({ keyHash, keyPrefix: prefix }),
        );
        mockRedisService.set.mockResolvedValue(undefined);

        await controller.verify({ key: apiKey });

        expect(mockRedisService.set).toHaveBeenCalledWith(
          `auth:apikey:${prefix}`,
          expect.any(String),
          API_KEY_CACHE_TTL,
        );
      });

      it("캐시 파싱 실패 시 캐시를 삭제하고 DB로 폴스루해야 한다", async () => {
        const apiKey = "rtf_abcdef123456rest_of_key";
        const prefix = apiKey.substring(0, 12);
        const keyHash = service["hashKey"](apiKey);
        mockRedisService.get.mockResolvedValue("invalid json{{{");
        mockRedisService.del.mockResolvedValue(undefined);
        mockRedisService.set.mockResolvedValue(undefined);
        mockApiKeysRepository.findByPrefix.mockResolvedValue(
          createApiKeyRecord({ keyHash, keyPrefix: prefix }),
        );

        const result = await controller.verify({ key: apiKey });

        expect(mockRedisService.del).toHaveBeenCalledWith(`auth:apikey:${prefix}`);
        expect(mockApiKeysRepository.findByPrefix).toHaveBeenCalledWith(prefix);
        expect(result).toEqual({ valid: true, userId: "user-123" });
      });

      it("무효 키 검증 결과도 캐시해야 한다", async () => {
        mockRedisService.get.mockResolvedValue(null);
        mockApiKeysRepository.findByPrefix.mockResolvedValue(null);
        mockRedisService.set.mockResolvedValue(undefined);

        await controller.verify({ key: "rtf_abcdef123456rest_of_key" });

        expect(mockRedisService.set).toHaveBeenCalledWith(
          expect.stringContaining("auth:apikey:"),
          JSON.stringify({ valid: false }),
          API_KEY_CACHE_TTL,
        );
      });
    });
  });
});
