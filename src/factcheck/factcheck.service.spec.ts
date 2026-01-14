import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { GuestRepository } from "../auth/repositories/guest.repository";
import { McpService } from "../mcp/mcp.service";
import type { McpResponse } from "../mcp/types/mcp.types";
import { SettingsService } from "../settings/settings.service";
import { FactCheckService } from "./factcheck.service";
import { FactCheckRepository } from "./repositories/factcheck.repository";

describe("FactCheckService", () => {
  let service: FactCheckService;
  let mockAnalyze: jest.Mock;
  let mockSaveFactCheck: jest.Mock;
  let mockGetGuestInfo: jest.Mock;
  let mockSetGuestInfo: jest.Mock;
  let mockDecrementRemainingUses: jest.Mock;
  let mockGetSettings: jest.Mock;

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
    mockAnalyze = jest.fn();
    mockSaveFactCheck = jest.fn();
    mockGetGuestInfo = jest.fn();
    mockSetGuestInfo = jest.fn();
    mockDecrementRemainingUses = jest.fn();

    mockGetSettings = jest.fn().mockResolvedValue({ whitelist: [], blacklist: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FactCheckService,
        {
          provide: McpService,
          useValue: {
            analyze: mockAnalyze,
          },
        },
        {
          provide: FactCheckRepository,
          useValue: {
            saveFactCheck: mockSaveFactCheck,
          },
        },
        {
          provide: GuestRepository,
          useValue: {
            getGuestInfo: mockGetGuestInfo,
            setGuestInfo: mockSetGuestInfo,
            decrementRemainingUses: mockDecrementRemainingUses,
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getSettings: mockGetSettings,
          },
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
        mockGetGuestInfo.mockResolvedValue({
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
        mockGetGuestInfo.mockResolvedValue(null);

        await expect(service.processFactCheck(mockGuestUser, "테스트 텍스트")).rejects.toThrow(
          ForbiddenException,
        );
      });

      it("게스트 정상 요청 시 사용량을 차감해야 한다", async () => {
        mockGetGuestInfo.mockResolvedValue({
          remainingUses: 3,
          createdAt: Date.now(),
        });
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        await service.processFactCheck(mockGuestUser, "테스트 텍스트");

        expect(mockDecrementRemainingUses).toHaveBeenCalledWith(mockGuestUser.ip);
      });
    });

    describe("Authenticated User", () => {
      it("로그인 사용자 요청 시 DB에 저장해야 한다", async () => {
        const mockFilters = { whitelist: ["good.com"], blacklist: ["bad.com"] };
        mockGetSettings.mockResolvedValue(mockFilters);
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(mockGetSettings).toHaveBeenCalledWith(mockAuthenticatedUser.userId);
        expect(mockAnalyze).toHaveBeenCalledWith("테스트 텍스트", mockFilters);

        expect(mockSaveFactCheck).toHaveBeenCalledWith(
          mockAuthenticatedUser.userId,
          expect.any(String),
          mockMcpResponse.title,
          "테스트 텍스트",
          expect.any(Array),
        );
      });

      it("로그인 사용자는 게스트 사용량을 차감하지 않아야 한다", async () => {
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(mockSetGuestInfo).not.toHaveBeenCalled();
      });
    });

    describe("Response Structure", () => {
      it("응답에 필요한 필드들이 포함되어야 한다", async () => {
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("title", mockMcpResponse.title);
        expect(result).toHaveProperty("originalText", "테스트 텍스트");
        expect(result).toHaveProperty("sentences");
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("createdAt");
      });

      it("excluded 타입 문장이 필터링되어야 한다", async () => {
        mockAnalyze.mockResolvedValue(mockMcpResponse);

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
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        // opinion(startIndex: 0)이 먼저, claim(startIndex: 10)이 나중
        expect(result.sentences[0].type).toBe("opinion");
        expect(result.sentences[0].position).toBe(0);
        expect(result.sentences[1].type).toBe("claim");
        expect(result.sentences[1].position).toBe(1);
      });

      it("claim 타입에 status: pending이 추가되어야 한다", async () => {
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        const claimSentence = result.sentences.find((s) => s.type === "claim");
        expect(claimSentence).toHaveProperty("status", "pending");
      });

      it("startIndex, endIndex가 응답에 포함되지 않아야 한다", async () => {
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        result.sentences.forEach((sentence) => {
          expect(sentence).not.toHaveProperty("startIndex");
          expect(sentence).not.toHaveProperty("endIndex");
        });
      });
    });

    describe("Summary Calculation", () => {
      it("summary가 정확하게 계산되어야 한다", async () => {
        mockAnalyze.mockResolvedValue(mockMcpResponse);

        const result = await service.processFactCheck(mockAuthenticatedUser, "테스트 텍스트");

        expect(result.summary.total).toBe(2);
        expect(result.summary.true).toBe(1);
        expect(result.summary.false).toBe(0);
        expect(result.summary.opinion).toBe(1);
      });
    });
  });
});
