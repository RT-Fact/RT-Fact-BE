import { BadGatewayException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { McpService } from "./mcp.service";
import type { McpResponse } from "./types/mcp.types";

describe("McpService", () => {
  let service: McpService;

  const mockMcpResponse: McpResponse = {
    title: "테스트 제목",
    originalText: "테스트 원본 텍스트",
    sentences: [
      {
        type: "claim",
        text: "검증 가능한 문장입니다.",
        startIndex: 0,
        endIndex: 20,
        verdict: "TRUE",
        sources: [{ title: "출처", url: "https://example.com" }],
      },
      {
        type: "opinion",
        text: "이것은 의견입니다.",
        startIndex: 21,
        endIndex: 35,
        reason: "주관적 표현 포함",
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue("http://localhost:8000"),
          },
        },
      ],
    }).compile();

    service = module.get<McpService>(McpService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("analyze", () => {
    it("정상 응답 시 McpResponse를 반환해야 한다", async () => {
      // Arrange
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockMcpResponse),
      });

      // Act
      const result = await service.analyze("테스트 텍스트");

      // Assert
      expect(result).toEqual(mockMcpResponse);
      expect(fetch).toHaveBeenCalledWith("http://localhost:8000/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "테스트 텍스트" }),
      });
    });

    it("서버가 500 에러를 반환하면 BadGatewayException을 던져야 한다", async () => {
      // Arrange
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      // Act & Assert
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(BadGatewayException);
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow("MCP_ERROR");
    });

    it("네트워크 오류 시 BadGatewayException을 던져야 한다", async () => {
      // Arrange
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

      // Act & Assert
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(BadGatewayException);
    });
  });
});
