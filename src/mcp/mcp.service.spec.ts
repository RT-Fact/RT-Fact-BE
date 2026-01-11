import { HttpService } from "@nestjs/axios";
import { BadGatewayException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { McpService } from "./mcp.service";
import type { McpResponse } from "./types/mcp.types";

jest.mock("uuid", () => ({
  v4: jest.fn().mockReturnValue("test-uuid"),
}));

describe("McpService", () => {
  let service: McpService;
  let mockAxiosPost: jest.Mock;

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
        suggestion: null,
      },
      {
        type: "opinion",
        text: "이것은 의견입니다.",
        startIndex: 21,
        endIndex: 35,
        reason: "주관적 표현 포함",
        suggestion: null,
      },
    ],
  };

  beforeEach(async () => {
    mockAxiosPost = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue("http://localhost:8000"),
          },
        },
        {
          provide: HttpService,
          useValue: {
            axiosRef: {
              post: mockAxiosPost,
              // axios-retry가 초기화 시 interceptors에 접근함
              interceptors: {
                request: { use: jest.fn() },
                response: { use: jest.fn() },
              },
            },
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
      // Arrange - Axios는 response.data로 직접 반환
      mockAxiosPost.mockResolvedValue({
        data: {
          jsonrpc: "2.0",
          id: "test-id",
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(mockMcpResponse),
              },
            ],
          },
        },
      });

      // Act
      const result = await service.analyze("테스트 텍스트");

      // Assert
      expect(result).toEqual(mockMcpResponse);
      expect(result.sentences).toHaveLength(2);
      expect(result.sentences[0].type).toBe("claim");
      expect(result.sentences[1].type).toBe("opinion");

      expect(mockAxiosPost).toHaveBeenCalledWith("http://localhost:8000/mcp", {
        jsonrpc: "2.0",
        id: "test-uuid",
        method: "tools/call",
        params: {
          name: "factcheck",
          arguments: { text: "테스트 텍스트" },
        },
      });
    });

    it("서버가 500 에러를 반환하면 BadGatewayException을 던져야 한다", async () => {
      // Arrange - Axios는 4xx/5xx에서 자동으로 에러 throw
      const axiosError = new Error("Request failed with status code 500");
      Object.assign(axiosError, {
        response: { status: 500, statusText: "Internal Server Error" },
        isAxiosError: true,
      });
      mockAxiosPost.mockRejectedValue(axiosError);

      // Act & Assert
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(BadGatewayException);
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow("MCP_ERROR");
    });

    it("네트워크 오류 시 BadGatewayException을 던져야 한다", async () => {
      // Arrange
      mockAxiosPost.mockRejectedValue(new Error("Network error"));

      // Act & Assert
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(BadGatewayException);
    });
  });
});
