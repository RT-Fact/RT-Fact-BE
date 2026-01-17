import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { AxiosError } from "axios";
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
              // axios-retry가 초기화 시 interceptors에 접근
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

      const result = await service.analyze("테스트 텍스트");

      expect(result).toEqual(mockMcpResponse);
      expect(result.sentences).toHaveLength(2);
      expect(result.sentences[0].type).toBe("claim");
      expect(result.sentences[1].type).toBe("opinion");

      expect(mockAxiosPost).toHaveBeenCalledWith("http://localhost:8000/api/factcheck", {
        jsonrpc: "2.0",
        id: "test-uuid",
        method: "tools/call",
        params: {
          name: "factcheck",
          arguments: {
            text: "테스트 텍스트",
            whitelist: [],
            blacklist: [],
          },
        },
      });
    });

    it("요청 형식이 요구사항과 일치해야 한다 (whitelist, blacklist 포함)", async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          jsonrpc: "2.0",
          id: "test-id",
          result: { content: [{ type: "text", text: "{}" }] },
        },
      });

      const text = "검증할 텍스트";
      const filters = {
        whitelist: ["naver.com"],
        blacklist: ["example.com"],
      };

      await service.analyze(text, filters);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining("/api/factcheck"),
        expect.objectContaining({
          jsonrpc: "2.0",
          id: "test-uuid",
          method: "tools/call",
          params: {
            name: "factcheck",
            arguments: {
              text: "검증할 텍스트",
              whitelist: ["naver.com"],
              blacklist: ["example.com"],
            },
          },
        }),
      );
    });

    it("서버가 500 에러를 반환하면 BadGatewayException을 던져야 한다", async () => {
      const axiosError = new Error("Request failed with status code 500");
      Object.assign(axiosError, {
        response: { status: 500, statusText: "Internal Server Error" },
        isAxiosError: true,
      });
      mockAxiosPost.mockRejectedValue(axiosError);

      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(BadGatewayException);
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow("MCP_ERROR");
    });

    it("네트워크 오류 시 BadGatewayException을 던져야 한다", async () => {
      mockAxiosPost.mockRejectedValue(new Error("Network error"));

      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(BadGatewayException);
    });

    it("타임아웃 시 GatewayTimeoutException을 던져야 한다", async () => {
      const axiosError = new AxiosError("timeout of 30000ms exceeded");
      axiosError.code = "ECONNABORTED";
      mockAxiosPost.mockRejectedValue(axiosError);

      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(GatewayTimeoutException);
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow("MCP_TIMEOUT");
    });

    it("연결 실패 시 ServiceUnavailableException을 던져야 한다", async () => {
      const axiosError = new AxiosError("connect ECONNREFUSED");
      axiosError.code = "ECONNREFUSED";
      mockAxiosPost.mockRejectedValue(axiosError);

      await expect(service.analyze("테스트 텍스트")).rejects.toThrow(ServiceUnavailableException);
      await expect(service.analyze("테스트 텍스트")).rejects.toThrow("MCP_UNAVAILABLE");
    });
  });
});
