import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { McpResponse } from "./types/mcp.types";

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly mcpServerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.mcpServerUrl = this.configService.getOrThrow<string>("MCP_SERVER_URL");
  }

  /**
   * MCP 서버에 텍스트 분석 요청
   * @param text 분석할 텍스트
   * @returns MCP 서버의 분석 결과
   * @throws BadGatewayException MCP 서버 호출 실패 시
   */
  async analyze(text: string): Promise<McpResponse> {
    try {
      const response = await fetch(`${this.mcpServerUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        this.logger.error(`MCP 서버 응답 실패: ${response.status} ${response.statusText}`);
        throw new BadGatewayException("MCP_ERROR");
      }

      const data = (await response.json()) as McpResponse;
      return data;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error(`MCP 서버 호출 중 오류 발생: ${error}`);
      throw new BadGatewayException("MCP_ERROR");
    }
  }
}
