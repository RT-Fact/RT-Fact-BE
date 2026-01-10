import { Test, type TestingModule } from "@nestjs/testing";
import type { RequestWithUser } from "../auth/types/auth.types";
import type { FactCheckResponse } from "./dto/factcheck-response.dto";
import { FactCheckController } from "./factcheck.controller";
import { FactCheckService } from "./factcheck.service";

describe("FactCheckController", () => {
  let controller: FactCheckController;
  let mockProcessFactCheck: jest.Mock;

  const mockFactCheckResponse: FactCheckResponse = {
    id: "factcheck-123",
    title: "테스트 제목",
    originalText: "원본 텍스트",
    sentences: [
      {
        id: "sentence-1",
        type: "claim",
        text: "검증 가능한 문장",
        position: 0,
        verdict: "TRUE",
        suggestion: null,
        sources: [],
        status: "pending",
      },
    ],
    summary: {
      total: 1,
      true: 1,
      false: 0,
      opinion: 0,
    },
    createdAt: "2026-01-01T00:00:00Z",
  };

  beforeEach(async () => {
    mockProcessFactCheck = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FactCheckController],
      providers: [
        {
          provide: FactCheckService,
          useValue: {
            processFactCheck: mockProcessFactCheck,
          },
        },
      ],
    }).compile();

    controller = module.get<FactCheckController>(FactCheckController);
  });

  describe("create", () => {
    it("유효한 요청 시 FactCheckService.processFactCheck를 호출해야 한다", async () => {
      const mockUser = {
        userId: "user-123",
        email: "test@example.com",
        isGuest: false as const,
      };
      const mockRequest = { user: mockUser } as unknown as RequestWithUser;
      const dto = { text: "테스트 텍스트" };

      mockProcessFactCheck.mockResolvedValue(mockFactCheckResponse);

      const result = await controller.create(mockRequest, dto);

      expect(mockProcessFactCheck).toHaveBeenCalledWith(mockUser, dto.text);
      expect(result).toEqual(mockFactCheckResponse);
    });

    it("게스트 사용자 요청도 처리해야 한다", async () => {
      const mockGuestUser = {
        ip: "192.168.1.1",
        isGuest: true as const,
      };
      const mockRequest = { user: mockGuestUser } as unknown as RequestWithUser;
      const dto = { text: "게스트 테스트" };

      mockProcessFactCheck.mockResolvedValue(mockFactCheckResponse);

      await controller.create(mockRequest, dto);

      expect(mockProcessFactCheck).toHaveBeenCalledWith(mockGuestUser, dto.text);
    });
  });
});
