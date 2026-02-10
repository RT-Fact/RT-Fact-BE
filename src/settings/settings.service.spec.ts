import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { ListType, Prisma } from "@prisma/client";
import { ERROR_CODES } from "../common/constants/error-codes";
import { DomainFilterRepository } from "./repositories/domain-filter.repository";
import { SettingsService } from "./settings.service";

interface MockFilter {
  domain: string;
  listType: ListType;
}

const TEST_USER_ID = "user-123";

const createFilter = (overrides?: Partial<MockFilter>): MockFilter => ({
  domain: "example.com",
  listType: ListType.WHITE,
  ...overrides,
});

describe("SettingsService", () => {
  let service: SettingsService;

  const mockRepository = {
    findFiltersByUserId: jest.fn(),
    findFiltersByType: jest.fn(),
    findFilter: jest.fn(),
    createFilter: jest.fn(),
    deleteFilter: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: DomainFilterRepository, useValue: mockRepository }],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getSettings", () => {
    it("필터를 화이트리스트와 블랙리스트로 분류하여 반환해야 한다", async () => {
      mockRepository.findFiltersByUserId.mockResolvedValue([
        createFilter({ domain: "good.com", listType: ListType.WHITE }),
        createFilter({ domain: "bad.com", listType: ListType.BLACK }),
        createFilter({ domain: "trusted.com", listType: ListType.WHITE }),
      ]);

      const result = await service.getSettings(TEST_USER_ID);

      expect(result).toEqual({
        whitelist: ["good.com", "trusted.com"],
        blacklist: ["bad.com"],
      });
    });

    it("필터가 없으면 빈 배열을 반환해야 한다", async () => {
      mockRepository.findFiltersByUserId.mockResolvedValue([]);

      const result = await service.getSettings(TEST_USER_ID);

      expect(result).toEqual({
        whitelist: [],
        blacklist: [],
      });
    });
  });

  describe("addWhitelist", () => {
    it("도메인을 화이트리스트에 추가하고 whitelist 키로 반환해야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockResolvedValue(undefined);
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "added.com" }]);

      const result = await service.addWhitelist(TEST_USER_ID, "added.com");

      expect(result).toEqual({ whitelist: ["added.com"] });
      expect(mockRepository.createFilter).toHaveBeenCalledWith(
        TEST_USER_ID,
        "added.com",
        ListType.WHITE,
      );
    });

    it("블랙리스트에 동일 도메인이 있으면 DOMAIN_CONFLICT를 던져야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(
        createFilter({ domain: "conflict.com", listType: ListType.BLACK }),
      );

      await expect(service.addWhitelist(TEST_USER_ID, "conflict.com")).rejects.toThrow(
        new ConflictException(ERROR_CODES.DOMAIN_CONFLICT),
      );
      expect(mockRepository.findFilter).toHaveBeenCalledWith(
        TEST_USER_ID,
        "conflict.com",
        ListType.BLACK,
      );
      expect(mockRepository.createFilter).not.toHaveBeenCalled();
    });

    it("P2002 유니크 제약 위반 시 DUPLICATE_DOMAIN을 던져야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "5.0.0",
        }),
      );

      await expect(service.addWhitelist(TEST_USER_ID, "dup.com")).rejects.toThrow(
        new ConflictException(ERROR_CODES.DUPLICATE_DOMAIN),
      );
    });

    it("P2002가 아닌 PrismaClientKnownRequestError는 그대로 rethrow해야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(null);
      const prismaError = new Prisma.PrismaClientKnownRequestError("FK constraint failed", {
        code: "P2003",
        clientVersion: "5.0.0",
      });
      mockRepository.createFilter.mockRejectedValue(prismaError);

      await expect(service.addWhitelist(TEST_USER_ID, "fk.com")).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
      await expect(service.addWhitelist(TEST_USER_ID, "fk.com")).rejects.not.toThrow(
        ConflictException,
      );
    });

    it("Prisma 이외의 에러는 그대로 rethrow해야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockRejectedValue(new Error("Connection lost"));

      await expect(service.addWhitelist(TEST_USER_ID, "err.com")).rejects.toThrow(
        "Connection lost",
      );
    });
  });

  describe("addBlacklist", () => {
    it("도메인을 블랙리스트에 추가하고 blacklist 키로 반환해야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockResolvedValue(undefined);
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "blocked.com" }]);

      const result = await service.addBlacklist(TEST_USER_ID, "blocked.com");

      expect(result).toEqual({ blacklist: ["blocked.com"] });
      expect(mockRepository.createFilter).toHaveBeenCalledWith(
        TEST_USER_ID,
        "blocked.com",
        ListType.BLACK,
      );
    });

    it("화이트리스트에 동일 도메인이 있으면 DOMAIN_CONFLICT를 던져야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(
        createFilter({ domain: "conflict.com", listType: ListType.WHITE }),
      );

      await expect(service.addBlacklist(TEST_USER_ID, "conflict.com")).rejects.toThrow(
        new ConflictException(ERROR_CODES.DOMAIN_CONFLICT),
      );
      expect(mockRepository.findFilter).toHaveBeenCalledWith(
        TEST_USER_ID,
        "conflict.com",
        ListType.WHITE,
      );
      expect(mockRepository.createFilter).not.toHaveBeenCalled();
    });

    it("P2002 유니크 제약 위반 시 DUPLICATE_DOMAIN을 던져야 한다", async () => {
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "5.0.0",
        }),
      );

      await expect(service.addBlacklist(TEST_USER_ID, "dup.com")).rejects.toThrow(
        new ConflictException(ERROR_CODES.DUPLICATE_DOMAIN),
      );
    });
  });

  describe("deleteWhitelist", () => {
    it("도메인을 삭제하고 남은 화이트리스트를 whitelist 키로 반환해야 한다", async () => {
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "remaining.com" }]);

      const result = await service.deleteWhitelist(TEST_USER_ID, "removed.com");

      expect(result).toEqual({ whitelist: ["remaining.com"] });
      expect(mockRepository.deleteFilter).toHaveBeenCalledWith(
        TEST_USER_ID,
        "removed.com",
        ListType.WHITE,
      );
    });

    it("마지막 도메인을 삭제하면 빈 배열을 반환해야 한다", async () => {
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([]);

      const result = await service.deleteWhitelist(TEST_USER_ID, "last.com");

      expect(result).toEqual({ whitelist: [] });
    });
  });

  describe("deleteBlacklist", () => {
    it("도메인을 삭제하고 남은 블랙리스트를 blacklist 키로 반환해야 한다", async () => {
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "still-bad.com" }]);

      const result = await service.deleteBlacklist(TEST_USER_ID, "removed-bad.com");

      expect(result).toEqual({ blacklist: ["still-bad.com"] });
      expect(mockRepository.deleteFilter).toHaveBeenCalledWith(
        TEST_USER_ID,
        "removed-bad.com",
        ListType.BLACK,
      );
    });

    it("마지막 도메인을 삭제하면 빈 배열을 반환해야 한다", async () => {
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([]);

      const result = await service.deleteBlacklist(TEST_USER_ID, "last-bad.com");

      expect(result).toEqual({ blacklist: [] });
    });
  });
});
