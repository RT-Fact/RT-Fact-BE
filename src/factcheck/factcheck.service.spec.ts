import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { GuestRepository } from "../auth/repositories/guest.repository";
import { McpService } from "../mcp/mcp.service";
import type { McpResponse } from "../mcp/types/mcp.types";
import { SettingsService } from "../settings/settings.service";
import { FactCheckService } from "./factcheck.service";
import { FactCheckRepository } from "./repositories/factcheck.repository";

interface MockDbSentence {
  id: string;
  type: "CLAIM" | "OPINION";
  text: string;
  position: number;
  verdict: "TRUE" | "FALSE" | null;
  suggestion: string | null;
  sources: Array<{ title: string; url: string }> | null;
  status: "PENDING" | "APPLIED" | "IGNORED" | null;
  reason: string | null;
}

interface MockDbFactCheck {
  id: string;
  title: string;
  originalText: string;
  createdAt: Date;
  sentences: MockDbSentence[];
}

const createDbClaim = (overrides?: Partial<MockDbSentence>): MockDbSentence => ({
  id: "1",
  type: "CLAIM",
  text: "검증 문장",
  position: 0,
  verdict: "TRUE",
  suggestion: null,
  sources: [{ title: "출처", url: "https://example.com" }],
  status: "PENDING",
  reason: null,
  ...overrides,
});

const createDbOpinion = (overrides?: Partial<MockDbSentence>): MockDbSentence => ({
  id: "2",
  type: "OPINION",
  text: "의견 문장",
  position: 0,
  verdict: null,
  suggestion: null,
  sources: null,
  status: null,
  reason: "주관적 표현",
  ...overrides,
});

const createDbFactCheck = (overrides?: Partial<MockDbFactCheck>): MockDbFactCheck => ({
  id: "fc-123",
  title: "제목",
  originalText: "텍스트",
  createdAt: new Date("2026-01-01"),
  sentences: [],
  ...overrides,
});

describe("FactCheckService", () => {
  let service: FactCheckService;

  const mockMcpService = {
    analyze: jest.fn(),
  };

  const mockFactCheckRepository = {
    saveFactCheck: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    deleteById: jest.fn(),
    updateClaimStatus: jest.fn(),
  };

  const mockGuestRepository = {
    getGuestInfo: jest.fn(),
    setGuestInfo: jest.fn(),
    decrementRemainingUses: jest.fn(),
  };

  const mockSettingsService = {
    getSettings: jest.fn().mockResolvedValue({ whitelist: [], blacklist: [] }),
  };

  const mockMcpResponse: McpResponse = {
    title: "테스트 제목",
    originalText: "원본 텍스트",
    sentences: [
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
        type: "opinion",
        text: "이것은 의견입니다.",
        startIndex: 0,
        endIndex: 9,
        reason: "주관적 표현",
        suggestion: null,
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

  const mockAuthenticatedUser = {
    userId: "user-123",
    email: "test@example.com",
    isGuest: false as const,
  };

  const mockGuestUser = {
    ip: "192.168.1.1",
    isGuest: true as const,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FactCheckService,
        {
          provide: McpService,
          useValue: mockMcpService,
        },
        {
          provide: FactCheckRepository,
          useValue: mockFactCheckRepository,
        },
        {
          provide: GuestRepository,
          useValue: mockGuestRepository,
        },
        {
          provide: SettingsService,
          useValue: mockSettingsService,
        },
      ],
    }).compile();

    service = module.get<FactCheckService>(FactCheckService);
  });

  describe("processFactCheck", () => {
    describe("Validation", () => {
      it("빈 텍스트 입력 시 BadRequestException을 던져야 한다", async () => {
        await expect(service.processFactCheck(mockAuthenticatedUser, "")).rejects.toThrow(
          BadRequestException,
        );

        await expect(service.processFactCheck(mockAuthenticatedUser, "   ")).rejects.toThrow(
          "EMPTY_TEXT",
        );
      });
    });

    describe("Guest User", () => {
      it("게스트 한도 초과 시 ForbiddenException을 던져야 한다", async () => {
        mockGuestRepository.getGuestInfo.mockResolvedValue({
          remainingUses: 0,
          createdAt: Date.now(),
        });

        await expect(service.processFactCheck(mockGuestUser, "테스트 텍스트")).rejects.toThrow(
          ForbiddenException,
        );

        await expect(service.processFactCheck(mockGuestUser, "테스트 텍스트")).rejects.toThrow(
          "GUEST_LIMIT_EXCEEDED",
        );
      });

      it("게스트 정보가 없으면 ForbiddenException을 던져야 한다", async () => {
        mockGuestRepository.getGuestInfo.mockResolvedValue(null);

        await expect(service.processFactCheck(mockGuestUser, "테스트 텍스트")).rejects.toThrow(
          ForbiddenException,
        );
      });

      it("게스트 정상 요청 시 사용량을 차감해야 한다", async () => {
        mockGuestRepository.getGuestInfo.mockResolvedValue({
          remainingUses: 3,
          createdAt: Date.now(),
        });
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        await service.processFactCheck(mockGuestUser, "테스트 텍스트");

        expect(mockGuestRepository.decrementRemainingUses).toHaveBeenCalledWith(mockGuestUser.ip);
      });
    });

    describe("Authenticated User", () => {
      it("로그인 사용자 요청 시 DB에 저장해야 한다", async () => {
        const mockFilters = { whitelist: ["good.com"], blacklist: ["bad.com"] };
        mockSettingsService.getSettings.mockResolvedValue(mockFilters);
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(mockSettingsService.getSettings).toHaveBeenCalledWith(mockAuthenticatedUser.userId);
        expect(mockMcpService.analyze).toHaveBeenCalledWith("테스트 텍스트", mockFilters);

        expect(mockFactCheckRepository.saveFactCheck).toHaveBeenCalledWith(
          mockAuthenticatedUser.userId,
          expect.any(String),
          mockMcpResponse.title,
          "테스트 텍스트",
          expect.any(Array),
        );
      });

      it("로그인 사용자는 게스트 사용량을 차감하지 않아야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(mockGuestRepository.setGuestInfo).not.toHaveBeenCalled();
      });
    });

    describe("Response Structure", () => {
      it("응답에 필요한 필드들이 포함되어야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("title", mockMcpResponse.title);
        expect(result).toHaveProperty("originalText", "테스트 텍스트");
        expect(result).toHaveProperty("sentences");
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("createdAt");
      });

      it("excluded 타입 문장이 필터링되어야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        // mockMcpResponse.sentences는 3개 (claim, opinion, excluded)
        // 결과는 2개 (excluded 필터링됨)
        const excludedCount = mockMcpResponse.sentences.filter((s) => s.type === "excluded").length;
        expect(result.sentences).toHaveLength(mockMcpResponse.sentences.length - excludedCount);

        // 결과 타입이 claim 또는 opinion만 포함하는지 확인
        expect(
          result.sentences.every((s) => s.type === "claim" || s.type === "opinion"),
        ).toBeTruthy();
      });

      it("startIndex 기준으로 정렬 후 position이 할당되어야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        // opinion(startIndex: 0)이 먼저, claim(startIndex: 10)이 나중
        expect(result.sentences[0].type).toBe("opinion");
        expect(result.sentences[0].position).toBe(0);
        expect(result.sentences[1].type).toBe("claim");
        expect(result.sentences[1].position).toBe(1);
      });

      it("claim 타입에 status: pending이 추가되어야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        const claimSentence = result.sentences.find((s) => s.type === "claim");
        expect(claimSentence).toHaveProperty("status", "pending");
      });

      it("startIndex, endIndex가 응답에 포함되지 않아야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        result.sentences.forEach((sentence) => {
          expect(sentence).not.toHaveProperty("startIndex");
          expect(sentence).not.toHaveProperty("endIndex");
        });
      });
    });

    describe("Summary Calculation", () => {
      it("summary가 정확하게 계산되어야 한다", async () => {
        mockMcpService.analyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(result.summary.total).toBe(2);
        expect(result.summary.true).toBe(1);
        expect(result.summary.false).toBe(0);
        expect(result.summary.opinion).toBe(1);
      });
    });
  });

  describe("getFactCheckHistory", () => {
    const query = { page: 1, limit: 10 };

    it("페이지네이션된 히스토리를 반환해야 한다", async () => {
      mockFactCheckRepository.findByUserId.mockResolvedValue({
        items: [
          {
            id: "fc-1",
            title: "제목 1",
            originalText: "짧은 텍스트",
            checkedCount: 3,
            createdAt: new Date("2026-01-01"),
          },
        ],
        total: 1,
      });

      const result = await service.getFactCheckHistory(mockAuthenticatedUser, query);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: "fc-1",
        title: "제목 1",
        preview: "짧은 텍스트",
        checkedCount: 3,
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

      const result = await service.getFactCheckHistory(mockAuthenticatedUser, query);

      expect(result.items[0].preview).toHaveLength(100);
    });

    it("totalPages를 올바르게 계산해야 한다", async () => {
      mockFactCheckRepository.findByUserId.mockResolvedValue({
        items: [],
        total: 25,
      });

      const result = await service.getFactCheckHistory(mockAuthenticatedUser, {
        page: 1,
        limit: 10,
      });

      expect(result.pagination.totalPages).toBe(3);
    });

    it("히스토리가 없으면 빈 배열을 반환해야 한다", async () => {
      mockFactCheckRepository.findByUserId.mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await service.getFactCheckHistory(mockAuthenticatedUser, query);

      expect(result.items).toEqual([]);
      expect(result.pagination.totalPages).toBe(0);
    });
  });

  describe("getFactCheckById", () => {
    const factCheckId = "fc-123";

    it("팩트체크 결과를 반환해야 한다", async () => {
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [createDbClaim()] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);

      expect(result).toHaveProperty("id", factCheckId);
      expect(result).toHaveProperty("sentences");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("createdAt", "2026-01-01T00:00:00.000Z");
    });

    it("claim 문장을 올바르게 변환해야 한다", async () => {
      const appliedClaim = createDbClaim({ suggestion: "수정 제안", status: "APPLIED" });
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [appliedClaim] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);
      const claim = result.sentences[0];

      expect(claim.type).toBe("claim");
      expect(claim).toHaveProperty("verdict", "TRUE");
      expect(claim).toHaveProperty("sources");
      expect(claim).toHaveProperty("suggestion", "수정 제안");
      expect(claim).toHaveProperty("status", "applied");
    });

    it("opinion 문장을 올바르게 변환해야 한다", async () => {
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [createDbOpinion()] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);
      const opinion = result.sentences[0];

      expect(opinion.type).toBe("opinion");
      expect(opinion).toHaveProperty("reason", "주관적 표현");
      expect(opinion).not.toHaveProperty("verdict");
      expect(opinion).not.toHaveProperty("sources");
    });

    it("summary를 올바르게 계산해야 한다", async () => {
      const trueClaim = createDbClaim({ text: "참 문장" });
      const falseClaim = createDbClaim({
        id: "2",
        text: "거짓 문장",
        position: 1,
        verdict: "FALSE",
        suggestion: "수정",
      });
      const opinion = createDbOpinion({ id: "3", text: "의견", position: 2, reason: "주관적" });
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [trueClaim, falseClaim, opinion] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);

      expect(result.summary).toEqual({
        total: 3,
        true: 1,
        false: 1,
        opinion: 1,
      });
    });

    it("verdict가 null인 claim은 'FALSE'로 기본값 설정해야 한다", async () => {
      const claimWithNullVerdict = createDbClaim({ verdict: null });
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [claimWithNullVerdict] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);

      expect(result.sentences[0]).toHaveProperty("verdict", "FALSE");
    });

    it("status가 null인 claim은 'pending'으로 기본값 설정해야 한다", async () => {
      const claimWithNullStatus = createDbClaim({ status: null });
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [claimWithNullStatus] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);

      expect(result.sentences[0]).toHaveProperty("status", "pending");
    });

    it("reason이 null인 opinion은 빈 문자열로 기본값 설정해야 한다", async () => {
      const opinionWithNullReason = createDbOpinion({ id: "1", reason: null });
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [opinionWithNullReason] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);

      expect(result.sentences[0]).toHaveProperty("reason", "");
    });

    it("sources가 null인 claim은 빈 배열로 기본값 설정해야 한다", async () => {
      const claimWithNullSources = createDbClaim({ sources: null });
      mockFactCheckRepository.findById.mockResolvedValue(
        createDbFactCheck({ sentences: [claimWithNullSources] }),
      );

      const result = await service.getFactCheckById(mockAuthenticatedUser, factCheckId);

      expect(result.sentences[0]).toHaveProperty("sources", []);
    });

    it("존재하지 않는 ID면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.findById.mockResolvedValue(null);

      await expect(
        service.getFactCheckById(mockAuthenticatedUser, "nonexistent-id"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteFactCheck", () => {
    const factCheckId = "fc-123";

    it("팩트체크를 정상적으로 삭제해야 한다", async () => {
      mockFactCheckRepository.deleteById.mockResolvedValue(true);

      const result = await service.deleteFactCheck(mockAuthenticatedUser, factCheckId);

      expect(result).toEqual({ success: true });
      expect(mockFactCheckRepository.deleteById).toHaveBeenCalledWith(
        mockAuthenticatedUser.userId,
        factCheckId,
      );
    });

    it("존재하지 않는 팩트체크면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.deleteById.mockResolvedValue(false);

      await expect(
        service.deleteFactCheck(mockAuthenticatedUser, "nonexistent-id"),
      ).rejects.toThrow(NotFoundException);
    });

    it("다른 사용자의 팩트체크면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.deleteById.mockResolvedValue(false);

      await expect(service.deleteFactCheck(mockAuthenticatedUser, factCheckId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("applyClaim", () => {
    const factCheckId = "fc-123";
    const claimId = "claim-1";

    it("게스트 사용자면 DB 호출 없이 applied 상태를 반환해야 한다", async () => {
      const result = await service.applyClaim(mockGuestUser, factCheckId, claimId);

      expect(result).toEqual({ id: claimId, status: "applied" });
      expect(mockFactCheckRepository.updateClaimStatus).not.toHaveBeenCalled();
    });

    it("인증 사용자면 updateClaimStatus를 호출해야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(true);

      const result = await service.applyClaim(mockAuthenticatedUser, factCheckId, claimId);

      expect(result).toEqual({ id: claimId, status: "applied" });
      expect(mockFactCheckRepository.updateClaimStatus).toHaveBeenCalledWith(
        mockAuthenticatedUser.userId,
        factCheckId,
        claimId,
        "APPLIED",
      );
    });

    it("존재하지 않는 claim이면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(false);

      await expect(service.applyClaim(mockAuthenticatedUser, factCheckId, claimId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("ignoreClaim", () => {
    const factCheckId = "fc-123";
    const claimId = "claim-1";

    it("게스트 사용자면 DB 호출 없이 ignored 상태를 반환해야 한다", async () => {
      const result = await service.ignoreClaim(mockGuestUser, factCheckId, claimId);

      expect(result).toEqual({ id: claimId, status: "ignored" });
      expect(mockFactCheckRepository.updateClaimStatus).not.toHaveBeenCalled();
    });

    it("인증 사용자면 updateClaimStatus를 호출해야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(true);

      const result = await service.ignoreClaim(mockAuthenticatedUser, factCheckId, claimId);

      expect(result).toEqual({ id: claimId, status: "ignored" });
      expect(mockFactCheckRepository.updateClaimStatus).toHaveBeenCalledWith(
        mockAuthenticatedUser.userId,
        factCheckId,
        claimId,
        "IGNORED",
      );
    });

    it("존재하지 않는 claim이면 NotFoundException을 던져야 한다", async () => {
      mockFactCheckRepository.updateClaimStatus.mockResolvedValue(false);

      await expect(
        service.ignoreClaim(mockAuthenticatedUser, factCheckId, claimId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
