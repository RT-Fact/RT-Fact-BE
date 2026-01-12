import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import axiosRetry from "axios-retry";
import { v4 as uuidv4 } from "uuid";
import { ERROR_CODES } from "../common/constants/error-codes";
import { JSON_RPC, MCP_CONFIG } from "./constants";
import type { JsonRpcResponse, McpResponse } from "./types/mcp.types";

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly mcpServerUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.mcpServerUrl = this.configService.getOrThrow<string>("MCP_SERVER_URL");

    axiosRetry(this.httpService.axiosRef, {
      retries: MCP_CONFIG.RETRIES,
      retryDelay: (retryCount) => axiosRetry.exponentialDelay(retryCount),
    });
  }

  /**
   * MCP 서버에 텍스트 분석 요청 (JSON-RPC 2.0)
   * @param text 분석할 텍스트
   * @returns MCP 서버의 분석 결과
   * @throws BadGatewayException MCP 서버 호출 실패 시
   */
  async analyze(text: string): Promise<McpResponse> {
    const startTime = Date.now();
    this.logger.log(`MCP 서버 요청 시작 (JSON-RPC) - 텍스트 길이: ${text.length}`);

    try {
      const response = await this.httpService.axiosRef.post<JsonRpcResponse>(
        `${this.mcpServerUrl}/mcp`,
        {
          jsonrpc: JSON_RPC.VERSION,
          id: uuidv4(),
          method: JSON_RPC.METHOD,
          params: {
            name: JSON_RPC.TOOL_NAME,
            arguments: { text },
          },
        },
      );

      const jsonRpcResponse = response.data;

      if ("error" in jsonRpcResponse && jsonRpcResponse.error) {
        this.logger.error(`MCP RPC 에러: ${JSON.stringify(jsonRpcResponse.error)}`);
        throw new BadGatewayException(ERROR_CODES.MCP_ERROR);
      }

      if (!jsonRpcResponse.result) {
        this.logger.error(`MCP 서버 응답에 result가 없습니다: ${JSON.stringify(jsonRpcResponse)}`);
        throw new BadGatewayException(ERROR_CODES.MCP_ERROR);
      }

      // 성공 응답: result.content[0].text에 JSON 문자열로 들어있음
      const content = jsonRpcResponse.result.content[0];
      if (!content || content.type !== "text") {
        this.logger.error("MCP 서버로부터 예상치 못한 응답 형식을 받았습니다.");
        throw new BadGatewayException(ERROR_CODES.MCP_ERROR);
      }

      const data = JSON.parse(content.text) as McpResponse;
      const elapsedTime = Date.now() - startTime;
      this.logger.log(
        `MCP 서버 응답 성공 - 소요 시간: ${elapsedTime}ms, 문장 수: ${data.sentences?.length ?? 0}`,
      );

      return data;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      const elapsedTime = Date.now() - startTime;

      if (error instanceof AxiosError) {
        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
          this.logger.error(`MCP 서버 타임아웃 (${elapsedTime}ms)`);
          throw new GatewayTimeoutException(ERROR_CODES.MCP_TIMEOUT);
        }

        if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
          this.logger.error(`MCP 서버 연결 실패: ${error.code}`);
          throw new ServiceUnavailableException(ERROR_CODES.MCP_UNAVAILABLE);
        }
      }

      this.logger.error(`MCP 서버 호출 중 오류 발생 (${elapsedTime}ms)`, error);
      throw new BadGatewayException(ERROR_CODES.MCP_ERROR);
    }
  }
}
