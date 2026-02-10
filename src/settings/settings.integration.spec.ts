import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { ListType, Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../auth/types/auth.types";
import { ERROR_CODES } from "../common/constants/error-codes";
import type { CreateDomainDto } from "./dto/create-domain.dto";
import { DomainFilterRepository } from "./repositories/domain-filter.repository";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

const createUser = (overrides?: Partial<AuthenticatedUser>): AuthenticatedUser => ({
  userId: "user-123",
  email: "test@example.com",
  isGuest: false as const,
  ...overrides,
});

const createDomainDto = (domain = "example.com"): CreateDomainDto => ({
  domain,
});

describe("Settings Integration (Controller + Service)", () => {
  let controller: SettingsController;

  const mockRepository = {
    findFiltersByUserId: jest.fn(),
    findFiltersByType: jest.fn(),
    findFilter: jest.fn(),
    createFilter: jest.fn(),
    deleteFilter: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [SettingsService, { provide: DomainFilterRepository, useValue: mockRepository }],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getSettings", () => {
    it("화이트리스트와 블랙리스트를 분류하여 반환해야 한다", async () => {
      const user = createUser();
      mockRepository.findFiltersByUserId.mockResolvedValue([
        { domain: "trusted.com", listType: ListType.WHITE },
        { domain: "bad.com", listType: ListType.BLACK },
        { domain: "good.com", listType: ListType.WHITE },
      ]);

      const result = await controller.getSettings(user);

      expect(result).toEqual({
        whitelist: ["trusted.com", "good.com"],
        blacklist: ["bad.com"],
      });
      expect(mockRepository.findFiltersByUserId).toHaveBeenCalledWith("user-123");
    });

    it("필터가 없으면 빈 배열을 반환해야 한다", async () => {
      const user = createUser();
      mockRepository.findFiltersByUserId.mockResolvedValue([]);

      const result = await controller.getSettings(user);

      expect(result).toEqual({
        whitelist: [],
        blacklist: [],
      });
    });

    it("화이트리스트만 있을 때 블랙리스트는 빈 배열이어야 한다", async () => {
      const user = createUser();
      mockRepository.findFiltersByUserId.mockResolvedValue([
        { domain: "trusted.com", listType: ListType.WHITE },
      ]);

      const result = await controller.getSettings(user);

      expect(result).toEqual({
        whitelist: ["trusted.com"],
        blacklist: [],
      });
    });
  });

  describe("addWhitelist", () => {
    it("도메인을 화이트리스트에 추가하고 목록을 반환해야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("trusted.com");
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockResolvedValue({
        id: 1,
        domain: "trusted.com",
        listType: ListType.WHITE,
        userId: "user-123",
      });
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "trusted.com" }]);

      const result = await controller.addWhitelist(user, dto);

      expect(result).toEqual({ whitelist: ["trusted.com"] });
      expect(mockRepository.findFilter).toHaveBeenCalledWith(
        "user-123",
        "trusted.com",
        ListType.BLACK,
      );
      expect(mockRepository.createFilter).toHaveBeenCalledWith(
        "user-123",
        "trusted.com",
        ListType.WHITE,
      );
    });

    it("복수 도메인이 존재할 때 전체 목록을 반환해야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("new-domain.com");
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockResolvedValue({
        id: 3,
        domain: "new-domain.com",
        listType: ListType.WHITE,
        userId: "user-123",
      });
      mockRepository.findFiltersByType.mockResolvedValue([
        { domain: "existing.com" },
        { domain: "new-domain.com" },
      ]);

      const result = await controller.addWhitelist(user, dto);

      expect(result).toEqual({ whitelist: ["existing.com", "new-domain.com"] });
    });

    it("블랙리스트에 동일 도메인이 있으면 ConflictException(DOMAIN_CONFLICT)을 던져야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("conflict.com");
      mockRepository.findFilter.mockResolvedValue({
        id: 1,
        domain: "conflict.com",
        listType: ListType.BLACK,
        userId: "user-123",
      });

      const promise = controller.addWhitelist(user, dto);
      await expect(promise).rejects.toThrow(new ConflictException(ERROR_CODES.DOMAIN_CONFLICT));
      expect(mockRepository.createFilter).not.toHaveBeenCalled();
    });

    it("이미 화이트리스트에 동일 도메인이 있으면 ConflictException(DUPLICATE_DOMAIN)을 던져야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("duplicate.com");
      mockRepository.findFilter.mockResolvedValue(null);
      const prismaError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.0.0",
      });
      mockRepository.createFilter.mockRejectedValue(prismaError);

      const promise = controller.addWhitelist(user, dto);
      await expect(promise).rejects.toThrow(new ConflictException(ERROR_CODES.DUPLICATE_DOMAIN));
    });

    it("PrismaClientKnownRequestError이지만 P2002가 아닌 에러는 그대로 rethrow해야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("fk-error.com");
      mockRepository.findFilter.mockResolvedValue(null);
      const prismaError = new Prisma.PrismaClientKnownRequestError("FK constraint failed", {
        code: "P2003",
        clientVersion: "5.0.0",
      });
      mockRepository.createFilter.mockRejectedValue(prismaError);

      const promise = controller.addWhitelist(user, dto);
      await expect(promise).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
      await expect(controller.addWhitelist(user, dto)).rejects.not.toThrow(ConflictException);
    });

    it("Prisma 이외의 에러는 그대로 rethrow해야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("error.com");
      mockRepository.findFilter.mockResolvedValue(null);
      const unknownError = new Error("DB connection lost");
      mockRepository.createFilter.mockRejectedValue(unknownError);

      await expect(controller.addWhitelist(user, dto)).rejects.toThrow("DB connection lost");
    });
  });

  describe("addBlacklist", () => {
    // 에러 분기(P2002, rethrow)는 addWhitelist에서 검증 — addFilter 공통 로직이므로 ListType 무관

    it("도메인을 블랙리스트에 추가하고 목록을 반환해야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("bad.com");
      mockRepository.findFilter.mockResolvedValue(null);
      mockRepository.createFilter.mockResolvedValue({
        id: 2,
        domain: "bad.com",
        listType: ListType.BLACK,
        userId: "user-123",
      });
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "bad.com" }]);

      const result = await controller.addBlacklist(user, dto);

      expect(result).toEqual({ blacklist: ["bad.com"] });
      expect(mockRepository.findFilter).toHaveBeenCalledWith("user-123", "bad.com", ListType.WHITE);
      expect(mockRepository.createFilter).toHaveBeenCalledWith(
        "user-123",
        "bad.com",
        ListType.BLACK,
      );
    });

    it("화이트리스트에 동일 도메인이 있으면 ConflictException(DOMAIN_CONFLICT)을 던져야 한다", async () => {
      const user = createUser();
      const dto = createDomainDto("conflict.com");
      mockRepository.findFilter.mockResolvedValue({
        id: 1,
        domain: "conflict.com",
        listType: ListType.WHITE,
        userId: "user-123",
      });

      const promise = controller.addBlacklist(user, dto);
      await expect(promise).rejects.toThrow(new ConflictException(ERROR_CODES.DOMAIN_CONFLICT));
      expect(mockRepository.createFilter).not.toHaveBeenCalled();
    });
  });

  describe("deleteWhitelist", () => {
    it("도메인을 화이트리스트에서 삭제하고 남은 목록을 반환해야 한다", async () => {
      const user = createUser();
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "remaining.com" }]);

      const result = await controller.deleteWhitelist(user, "removed.com");

      expect(result).toEqual({ whitelist: ["remaining.com"] });
      expect(mockRepository.deleteFilter).toHaveBeenCalledWith(
        "user-123",
        "removed.com",
        ListType.WHITE,
      );
    });

    it("마지막 도메인을 삭제하면 빈 배열을 반환해야 한다", async () => {
      const user = createUser();
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([]);

      const result = await controller.deleteWhitelist(user, "last.com");

      expect(result).toEqual({ whitelist: [] });
    });

    // deleteMany는 존재하지 않는 도메인도 {count: 0}을 반환 — 멱등성 보장 검증
    it("존재하지 않는 도메인 삭제 시 에러 없이 현재 목록을 반환해야 한다", async () => {
      const user = createUser();
      mockRepository.deleteFilter.mockResolvedValue({ count: 0 });
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "existing.com" }]);

      const result = await controller.deleteWhitelist(user, "non-existent.com");

      expect(result).toEqual({ whitelist: ["existing.com"] });
    });
  });

  describe("deleteBlacklist", () => {
    it("도메인을 블랙리스트에서 삭제하고 남은 목록을 반환해야 한다", async () => {
      const user = createUser();
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([{ domain: "still-bad.com" }]);

      const result = await controller.deleteBlacklist(user, "removed-bad.com");

      expect(result).toEqual({ blacklist: ["still-bad.com"] });
      expect(mockRepository.deleteFilter).toHaveBeenCalledWith(
        "user-123",
        "removed-bad.com",
        ListType.BLACK,
      );
    });

    it("마지막 도메인을 삭제하면 빈 배열을 반환해야 한다", async () => {
      const user = createUser();
      mockRepository.deleteFilter.mockResolvedValue({ count: 1 });
      mockRepository.findFiltersByType.mockResolvedValue([]);

      const result = await controller.deleteBlacklist(user, "last-bad.com");

      expect(result).toEqual({ blacklist: [] });
    });
  });
});
