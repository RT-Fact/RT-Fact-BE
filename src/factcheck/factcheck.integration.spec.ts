import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { GuestRepository } from "../auth/repositories/guest.repository";
import type { AuthenticatedUser, GuestUser } from "../auth/types/auth.types";
import { ERROR_CODES } from "../common/constants/error-codes";
import { McpService } from "../mcp/mcp.service";
import type { McpResponse } from "../mcp/types/mcp.types";
import { SettingsService } from "../settings/settings.service";
import { FactCheckController } from "./factcheck.controller";
import { FactCheckService } from "./factcheck.service";
import { FactCheckRepository } from "./repositories/factcheck.repository";
import { createDbClaim, createDbFactCheck, createDbOpinion } from "./testing/factories";
import type { FactCheckRequest } from "./types/factcheck.types";

describe("FactCheck Integration", () => {
  let controller: FactCheckController;

  const mockFactCheckRepository = {
    saveFactCheck: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    deleteById: jest.fn(),
    updateClaimStatus: jest.fn(),
  };

  const mockMcpService = {
    analyze: jest.fn(),
  };

  const mockGuestRepository = {
    getGuestInfo: jest.fn(),
    decrementRemainingUses: jest.fn(),
  };

  const mockSettingsService = {
    getSettings: jest.fn().mockResolvedValue({ whitelist: [], blacklist: [] }),
  };

  const authenticatedUser: AuthenticatedUser = {
    userId: "user-123",
    email: "test@example.com",
    isGuest: false as const,
  };

  const guestUser: GuestUser = {
    ip: "192.168.1.1",
    isGuest: true as const,
  };

  const mockMcpResponse: McpResponse = {
    title: "팩트체크 결과 제목",
    originalText: "원본 텍스트",
    sentences: [
      {
        type: "opinion",
        text: "이것은 의견입니다.",
        startIndex: 0,
        endIndex: 9,
        reason: "주관적 표현",
        suggestion: null,
      },
      {
        type: "claim",
        text: "검증 가능한 문장입니다.",
        startIndex: 10,
        endIndex: 30,
        verdict: "TRUE",
        suggestion: null,
        sources: [{ title: "출처", url: "https://example.com" }],
      },
      {
        type: "excluded",
        text: "제외될 문장",
        startIndex: 31,
        endIndex: 40,
        suggestion: null,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FactCheckController],
      providers: [
        FactCheckService,
        { provide: FactCheckRepository, useValue: mockFactCheckRepository },
        { provide: McpService, useValue: mockMcpService },
        { provide: GuestRepository, useValue: mockGuestRepository },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    controller = module.get<FactCheckController>(FactCheckController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    describe("인증 사용자", () => {
      it("팩트체크를 수행하고 변환된 응답을 반환해야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);
        mockFactCheckRepository.saveFactCheck.mockResolvedValue(undefined);
        const req: FactCheckRequest = { user: authenticatedUser };

        const result = await controller.create(req, { text: "테스트 텍스트" });

        expect(result).toHaveProperty("id");
        expect(result.title).toBe(mockMcpResponse.title);
        expect(result.originalText).toBe("테스트 텍스트");
        expect(result.sentences).toHaveLength(2);
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("createdAt");
      });

      it("excluded 문장을 필터링하고 startIndex 기준으로 정렬해야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);
        mockFactCheckRepository.saveFactCheck.mockResolvedValue(undefined);
        const req: FactCheckRequest = { user: authenticatedUser };

        const result = await controller.create(req, { text: "테스트 텍스트" });

        expect(result.sentences[0].type).toBe("opinion");
        expect(result.sentences[0].position).toBe(0);
        expect(result.sentences[1].type).toBe("claim");
        expect(result.sentences[1].position).toBe(1);
      });

      it("summary를 정확하게 계산해야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);
        mockFactCheckRepository.saveFactCheck.mockResolvedValue(undefined);
        const req: FactCheckRequest = { user: authenticatedUser };

        const result = await controller.create(req, { text: "테스트 텍스트" });

        expect(result.summary).toEqual({
          total: 2,
          true: 1,
          false: 0,
          opinion: 1,
        });
      });

      it("FALSE verdict가 포함된 응답의 summary를 정확하게 계산해야 한다", async () => {
        const mcpResponseWithFalse: McpResponse = {
          title: "팩트체크 결과",
          originalText: "원본 텍스트",
          sentences: [
            {
              type: "claim",
              text: "참인 문장",
              startIndex: 0,
              endIndex: 10,
              verdict: "TRUE",
              suggestion: null,
              sources: [{ title: "출처", url: "https://example.com" }],
            },
            {
              type: "claim",
              text: "거짓인 문장",
              startIndex: 11,
              endIndex: 20,
              verdict: "FALSE",
              suggestion: "수정된 문장",
              sources: [{ title: "출처2", url: "https://example2.com" }],
            },
            {
              type: "opinion",
              text: "의견 문장",
              startIndex: 21,
              endIndex: 30,
              reason: "주관적",
              suggestion: null,
            },
          ],
        };
        mockMcpService.analyze.mockResolvedValue(mcpResponseWithFalse);
        mockFactCheckRepository.saveFactCheck.mockResolvedValue(undefined);
        const req: FactCheckRequest = { user: authenticatedUser };

        const result = await controller.create(req, { text: "테스트 텍스트" });

        expect(result.summary).toEqual({
          total: 3,
          true: 1,
          false: 1,
          opinion: 1,
        });
        expect(result.sentences).toHaveLength(3);
      });

      it("DB에 저장하고 사용자 설정을 조회해야 한다", async () => {
        const filters = { whitelist: ["good.com"], blacklist: ["bad.com"] };
        mockSettingsService.getSettings.mockResolvedValue(filters);
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);
        mockFactCheckRepository.saveFactCheck.mockResolvedValue(undefined);
        const req: FactCheckRequest = { user: authenticatedUser };

        await controller.create(req, { text: "테스트 텍스트" });

        expect(mockSettingsService.getSettings).toHaveBeenCalledWith(authenticatedUser.userId);
        expect(mockMcpService.analyze).toHaveBeenCalledWith("테스트 텍스트", filters);
        expect(mockFactCheckRepository.saveFactCheck).toHaveBeenCalledWith(
          authenticatedUser.userId,
          expect.any(String),
          mockMcpResponse.title,
          "테스트 텍스트",
          expect.any(Array),
        );
      });

      it("DB 저장 실패 시 에러를 전파해야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);
        mockFactCheckRepository.saveFactCheck.mockRejectedValue(new Error("DB connection lost"));
        const req: FactCheckRequest = { user: authenticatedUser };

        await expect(controller.create(req, { text: "테스트 텍스트" })).rejects.toThrow(
          "DB connection lost",
        );
      });

      it("게스트 사용량을 차감하지 않아야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);
        mockFactCheckRepository.saveFactCheck.mockResolvedValue(undefined);
        const req: FactCheckRequest = { user: authenticatedUser };

        await controller.create(req, { text: "테스트 텍스트" });

        expect(mockGuestRepository.decrementRemainingUses).not.toHaveBeenCalled();
      });
    });

    describe("게스트 사용자", () => {
      it("잔여 횟수가 있으면 팩트체크를 수행해야 한다", async () => {
        mockGuestRepository.getGuestInfo.mockResolvedValue({
          remainingUses: 3,
          createdAt: Date.now(),
        });
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);
        const req: FactCheckRequest = { user: guestUser };

        const result = await controller.create(req, { text: "게스트 테스트 텍스트" });

        expect(result).toHaveProperty("id");
        expect(result.sentences).toHaveLength(2);
        expect(mockGuestRepository.decrementRemainingUses).toHaveBeenCalledWith(guestUser.ip);
        expect(mockFactCheckRepository.saveFactCheck).not.toHaveBeenCalled();
      });

      it("한도 초과 시 ForbiddenException을 던져야 한다", async () => {
        mockGuestRepository.getGuestInfo.mockResolvedValue({
          remainingUses: 0,
          createdAt: Date.now(),
        });
        const req: FactCheckRequest = { user: guestUser };

        await expect(controller.create(req, { text: "테스트" })).rejects.toThrow(
          new ForbiddenException(ERROR_CODES.GUEST_LIMIT_EXCEEDED),
        );
      });

      it("게스트 정보가 없으면 ForbiddenException을 던져야 한다", async () => {
        mockGuestRepository.getGuestInfo.mockResolvedValue(null);
        const req: FactCheckRequest = { user: guestUser };

        await expect(controller.create(req, { text: "테스트" })).rejects.toThrow(
          new ForbiddenException(ERROR_CODES.GUEST_LIMIT_EXCEEDED),
        );
      });
    });

    describe("빈 텍스트", () => {
      it("빈 문자열 시 BadRequestException을 던져야 한다", async () => {
        const req: FactCheckRequest = { user: authenticatedUser };

        await expect(controller.create(req, { text: "" })).rejects.toThrow(
          new BadRequestException(ERROR_CODES.EMPTY_TEXT),
        );
      });

      it("공백만 있는 텍스트 시 BadRequestException을 던져야 한다", async () => {
        const req: FactCheckRequest = { user: authenticatedUser };

        await expect(controller.create(req, { text: "   " })).rejects.toThrow(
          new BadRequestException(ERROR_CODES.EMPTY_TEXT),
        );
      });
    });
  });

  describe("findAll", () => {
    it("페이지네이션된 히스토리를 반환해야 한다", async () => {
      mockFactCheckRepository.findByUserId.mockResolvedValue({
        items: [
          {
            id: "fc-1",
            title: "제목",
            originalText: "짧은 텍스트",
            checkedCount: 2,
            createdAt: new Date("2026-01-01"),
          },
        ],
        total: 1,
      });

      const result = await controller.findAll(authenticatedUser, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: "fc-1",
        title: "제목",
        preview: "짧은 텍스트",
        checkedCount: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it("preview를 100자로 절단해야 한다", async () => {
      const longText = "가".repeat(200);
      mockFactCheckRepository.findByUserId.mockResolvedValue({
        items: [
          {
            id: "fc-1",
            title: "제목",
            originalText: longText,
            checkedCount: 1,
            createdAt: new Date("2026-01-01"),
          },
        ],
        total: 1,
      });

      const result = await controller.findAll(authenticatedUser, { page: 1, limit: 10 });

      expect(result.items[0].preview).toHaveLength(100);
    });

    it("히스토리가 없으면 빈 배열을 반환해야 한다", async () => {
      mockFactCheckRepository.findByUserId.mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await controller.findAll(authenticatedUser, { page: 1, limit: 10 });

      expect(result.items).toEqual([]);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe("findById", () => {
    it("팩트체크 결과를 변환하여 반환해야 한다", async () => {
      const claim = createDbClaim({ id: "1", position: 0 });
      const opinion = createDbOpinion({ id: "2", position: 1 });
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [claim, opinion] }),
      );

      const result = await controller.findById(authenticatedUser, "fc-123");

      expect(result.id).toBe("fc-123");
      expect(result.sentences).toHaveLength(2);
      expect(result.sentences[0].type).toBe("claim");
      expect(result.sentences[1].type).toBe("opinion");
      expect(result.summary).toEqual({
        total: 2,
        true: 1,
        false: 0,
        opinion: 1,
      });
    });

    it("존재하지 않는 ID면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.findById.mockResolvedValue(null);

      await expect(controller.findById(authenticatedUser, "nonexistent-id")).rejects.toThrow(
        new NotFoundException(ERROR_CODES.FACTCHECK_NOT_FOUND),
      );
    });
  });

  describe("delete", () => {
    it("팩트체크를 삭제하고 success를 반환해야 한다", async () => {
      mockFactCheckRepository.deleteById.mockResolvedValue(true);

      const result = await controller.delete(authenticatedUser, "fc-123");

      expect(result).toEqual({ success: true });
      expect(mockFactCheckRepository.deleteById).toHaveBeenCalledWith(
        authenticatedUser.userId,
        "fc-123",
      );
    });

    it("존재하지 않는 팩트체크면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.deleteById.mockResolvedValue(false);

      await expect(controller.delete(authenticatedUser, "nonexistent-id")).rejects.toThrow(
        new NotFoundException(ERROR_CODES.FACTCHECK_NOT_FOUND),
      );
    });
  });

  describe("apply", () => {
    it("인증 사용자면 claim 상태를 applied로 변경해야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(true);
      const req: FactCheckRequest = { user: authenticatedUser };

      const result = await controller.apply(req, "fc-123", "claim-1");

      expect(result).toEqual({ id: "claim-1", status: "applied" });
      expect(mockFactCheckRepository.updateClaimStatus).toHaveBeenCalledWith(
        authenticatedUser.userId,
        "fc-123",
        "claim-1",
        "APPLIED",
      );
    });

    it("게스트 사용자면 DB 호출 없이 applied 상태를 반환해야 한다", async () => {
      const req: FactCheckRequest = { user: guestUser };

      const result = await controller.apply(req, "fc-123", "claim-1");

      expect(result).toEqual({ id: "claim-1", status: "applied" });
      expect(mockFactCheckRepository.updateClaimStatus).not.toHaveBeenCalled();
    });

    it("존재하지 않는 claim이면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(false);
      const req: FactCheckRequest = { user: authenticatedUser };

      await expect(controller.apply(req, "fc-123", "claim-1")).rejects.toThrow(
        new NotFoundException(ERROR_CODES.CLAIM_NOT_FOUND),
      );
    });
  });

  describe("ignore", () => {
    it("인증 사용자면 claim 상태를 ignored로 변경해야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(true);
      const req: FactCheckRequest = { user: authenticatedUser };

      const result = await controller.ignore(req, "fc-123", "claim-1");

      expect(result).toEqual({ id: "claim-1", status: "ignored" });
      expect(mockFactCheckRepository.updateClaimStatus).toHaveBeenCalledWith(
        authenticatedUser.userId,
        "fc-123",
        "claim-1",
        "IGNORED",
      );
    });

    it("게스트 사용자면 DB 호출 없이 ignored 상태를 반환해야 한다", async () => {
      const req: FactCheckRequest = { user: guestUser };

      const result = await controller.ignore(req, "fc-123", "claim-1");

      expect(result).toEqual({ id: "claim-1", status: "ignored" });
      expect(mockFactCheckRepository.updateClaimStatus).not.toHaveBeenCalled();
    });

    it("존재하지 않는 claim이면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(false);
      const req: FactCheckRequest = { user: authenticatedUser };

      await expect(controller.ignore(req, "fc-123", "claim-1")).rejects.toThrow(
        new NotFoundException(ERROR_CODES.CLAIM_NOT_FOUND),
      );
    });
  });
});
