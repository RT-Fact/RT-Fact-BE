import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { RedisService } from "../redis/redis.service";
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
  id: "key-id",
  name: "My API Key",
  keyPrefix: "rtf_abcd1234",
  keyHash: "hashed",
  userId: "user-123",
  createdAt: new Date("2026-01-01"),
  ...overrides,
});

describe("ApiKeysService", () => {
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
      providers: [
        ApiKeysService,
        { provide: ApiKeysRepository, useValue: mockApiKeysRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("hashKey", () => {
    it("동일 입력에 대해 동일 해시를 반환해야 한다", () => {
      const key = "rtf_test_key_123";
      const hash1 = service["hashKey"](key);
      const hash2 = service["hashKey"](key);

      expect(hash1).toBe(hash2);
    });

    it("다른 입력에 대해 다른 해시를 반환해야 한다", () => {
      const hash1 = service["hashKey"]("rtf_key_aaa");
      const hash2 = service["hashKey"]("rtf_key_bbb");

      expect(hash1).not.toBe(hash2);
    });

    it("SHA256 hex 형식(64자)을 반환해야 한다", () => {
      const hash = service["hashKey"]("rtf_test_key");

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("verifyHash", () => {
    it("올바른 키와 해시 쌍이면 true를 반환해야 한다", () => {
      const key = "rtf_correct_key";
      const hash = service["hashKey"](key);

      const result = service["verifyHash"](key, hash);

      expect(result).toBe(true);
    });

    it("잘못된 키면 false를 반환해야 한다", () => {
      const correctKey = "rtf_correct_key";
      const hash = service["hashKey"](correctKey);

      const result = service["verifyHash"]("rtf_wrong_key", hash);

      expect(result).toBe(false);
    });

    it("길이가 다른 해시면 false를 반환해야 한다", () => {
      const result = service["verifyHash"]("rtf_key", "short_hash");

      expect(result).toBe(false);
    });
  });

  describe("createApiKey", () => {
    const userId = "user-123";
    const createDto = { name: "My API Key" };

    it("API 키를 정상적으로 생성해야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(0);
      mockApiKeysRepository.create.mockResolvedValue(createApiKeyRecord());

      const result = await service.createApiKey(userId, createDto);

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("name", "My API Key");
      expect(result).toHaveProperty("prefix");
      expect(result).toHaveProperty("secretKey");
      expect(result).toHaveProperty("createdAt");
    });

    it("secretKey가 rtf_ 접두사로 시작해야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(0);
      mockApiKeysRepository.create.mockResolvedValue(createApiKeyRecord());

      const result = await service.createApiKey(userId, createDto);

      expect(result.secretKey).toMatch(new RegExp(`^${API_KEY_PREFIX}`));
    });

    it("keyHash를 SHA256으로 해싱하여 저장해야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(0);

      let savedKeyHash = "";
      mockApiKeysRepository.create.mockImplementation((data: { keyHash: string }) => {
        savedKeyHash = data.keyHash;
        return Promise.resolve(createApiKeyRecord({ keyHash: data.keyHash }));
      });

      await service.createApiKey(userId, createDto);

      expect(savedKeyHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("한도 초과 시 ForbiddenException을 던져야 한다", async () => {
      mockApiKeysRepository.countByUserId.mockResolvedValue(DEFAULT_MAX_API_KEYS);

      await expect(service.createApiKey(userId, createDto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("deleteApiKey", () => {
    const userId = "user-123";
    const keyId = "key-id";

    it("키를 정상적으로 삭제해야 한다", async () => {
      mockApiKeysRepository.findById.mockResolvedValue(createApiKeyRecord());
      mockApiKeysRepository.delete.mockResolvedValue(undefined);
      mockRedisService.del.mockResolvedValue(undefined);

      const result = await service.deleteApiKey(userId, keyId);

      expect(result).toEqual({ success: true });
    });

    it("Redis 캐시도 함께 삭제해야 한다", async () => {
      const prefix = "rtf_abcd1234";
      mockApiKeysRepository.findById.mockResolvedValue(createApiKeyRecord({ keyPrefix: prefix }));
      mockApiKeysRepository.delete.mockResolvedValue(undefined);
      mockRedisService.del.mockResolvedValue(undefined);

      await service.deleteApiKey(userId, keyId);

      expect(mockRedisService.del).toHaveBeenCalledWith(`auth:apikey:${prefix}`);
    });

    it("존재하지 않는 키면 NotFoundException을 던져야 한다", async () => {
      mockApiKeysRepository.findById.mockResolvedValue(null);

      await expect(service.deleteApiKey(userId, keyId)).rejects.toThrow(NotFoundException);
    });

    it("다른 사용자의 키면 NotFoundException을 던져야 한다", async () => {
      const otherUserKey = createApiKeyRecord({ userId: "other-user" });
      mockApiKeysRepository.findById.mockResolvedValue(otherUserKey);

      await expect(service.deleteApiKey(userId, keyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe("verifyApiKey", () => {
    it("빈 키면 { valid: false }를 반환해야 한다", async () => {
      const result = await service.verifyApiKey("");

      expect(result).toEqual({ valid: false });
    });

    it("null이면 { valid: false }를 반환해야 한다", async () => {
      const result = await service.verifyApiKey(null as unknown as string);

      expect(result).toEqual({ valid: false });
    });

    it("rtf_ 접두사가 없으면 { valid: false }를 반환해야 한다", async () => {
      const result = await service.verifyApiKey("invalid_key_format");

      expect(result).toEqual({ valid: false });
    });

    it("Redis 캐시 히트 시 DB를 조회하지 않아야 한다", async () => {
      const cachedResult = JSON.stringify({ valid: true, userId: "user-123" });
      mockRedisService.get.mockResolvedValue(cachedResult);

      const result = await service.verifyApiKey("rtf_abcdef123456rest_of_key");

      expect(result).toEqual({ valid: true, userId: "user-123" });
      expect(mockApiKeysRepository.findByPrefix).not.toHaveBeenCalled();
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

      await service.verifyApiKey(apiKey);

      expect(mockRedisService.del).toHaveBeenCalled();
      expect(mockApiKeysRepository.findByPrefix).toHaveBeenCalledWith(prefix);
    });

    it("DB에 키가 없으면 { valid: false }를 반환하고 캐시해야 한다", async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockApiKeysRepository.findByPrefix.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.verifyApiKey("rtf_abcdef123456rest_of_key");

      expect(result).toEqual({ valid: false });
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it("해시 불일치 시 { valid: false }를 반환하고 캐시해야 한다", async () => {
      mockRedisService.get.mockResolvedValue(null);
      const keyWithMismatchedHash = createApiKeyRecord({
        keyHash: "completely_different_hash_value_that_does_not_match_at_all_x",
        keyPrefix: "rtf_abcdef12",
      });
      mockApiKeysRepository.findByPrefix.mockResolvedValue(keyWithMismatchedHash);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.verifyApiKey("rtf_abcdef123456rest_of_key");

      expect(result).toEqual({ valid: false });
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it("해시 일치 시 { valid: true, userId }를 반환하고 캐시해야 한다", async () => {
      const apiKey = "rtf_abcdef123456rest_of_key";
      const prefix = apiKey.substring(0, 12);
      const keyHash = service["hashKey"](apiKey);

      mockRedisService.get.mockResolvedValue(null);
      mockApiKeysRepository.findByPrefix.mockResolvedValue(
        createApiKeyRecord({ keyHash, keyPrefix: prefix }),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.verifyApiKey(apiKey);

      expect(result).toEqual({ valid: true, userId: "user-123" });
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it("캐시 TTL을 300초(300_000ms)로 설정해야 한다", async () => {
      const apiKey = "rtf_abcdef123456rest_of_key";
      const keyHash = service["hashKey"](apiKey);

      mockRedisService.get.mockResolvedValue(null);
      mockApiKeysRepository.findByPrefix.mockResolvedValue(
        createApiKeyRecord({ keyHash, keyPrefix: apiKey.substring(0, 12) }),
      );
      mockRedisService.set.mockResolvedValue(undefined);

      await service.verifyApiKey(apiKey);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        API_KEY_CACHE_TTL,
      );
    });
  });

  describe("listApiKeys", () => {
    const userId = "user-123";

    it("사용자의 API 키 목록을 반환해야 한다", async () => {
      const now = new Date();
      mockApiKeysRepository.findByUserId.mockResolvedValue([
        createApiKeyRecord({
          id: "key-1",
          name: "Key 1",
          keyPrefix: "rtf_aaaa1111",
          keyHash: "hash1",
          createdAt: now,
        }),
        createApiKeyRecord({
          id: "key-2",
          name: "Key 2",
          keyPrefix: "rtf_bbbb2222",
          keyHash: "hash2",
          createdAt: now,
        }),
      ]);

      const result = await service.listApiKeys(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "key-1",
        name: "Key 1",
        prefix: "rtf_aaaa1111",
        createdAt: now,
      });
    });

    it("keyHash를 응답에 포함하지 않아야 한다", async () => {
      mockApiKeysRepository.findByUserId.mockResolvedValue([
        createApiKeyRecord({
          id: "key-1",
          name: "Key 1",
          keyPrefix: "rtf_aaaa1111",
          keyHash: "should_not_appear",
        }),
      ]);

      const result = await service.listApiKeys(userId);

      expect(result[0]).not.toHaveProperty("keyHash");
    });

    it("키가 없으면 빈 배열을 반환해야 한다", async () => {
      mockApiKeysRepository.findByUserId.mockResolvedValue([]);

      const result = await service.listApiKeys(userId);

      expect(result).toEqual([]);
    });
  });
});
