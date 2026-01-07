import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { GuestRepository } from "../auth/repositories/guest.repository";
import { McpService } from "../mcp/mcp.service";
import { McpSentence } from "../mcp/types/mcp.types";
import {
  ClaimSentenceResponse,
  FactCheckResponse,
  FactCheckSummary,
  OpinionSentenceResponse,
  SentenceResponse,
} from "./dto/factcheck-response.dto";
import { FactCheckRepository } from "./repositories/factcheck.repository";
import { RequestUser } from "./types/factcheck.types";

@Injectable()
export class FactCheckService {
  private readonly logger = new Logger(FactCheckService.name);

  constructor(
    private readonly mcpService: McpService,
    private readonly factCheckRepository: FactCheckRepository,
    private readonly guestRepository: GuestRepository,
  ) {}

  /**
   * 팩트체크 수행
   */
  async processFactCheck(user: RequestUser, text: string): Promise<FactCheckResponse> {
    // 1. 빈 텍스트 검증
    if (!text || text.trim().length === 0) {
      throw new BadRequestException("EMPTY_TEXT");
    }

    // 2. 게스트 사용량 확인
    if (user.isGuest) {
      const guestInfo = await this.guestRepository.getGuestInfo(user.ip);
      if (!guestInfo || guestInfo.remainingUses <= 0) {
        throw new ForbiddenException("GUEST_LIMIT_EXCEEDED");
      }
    }

    // 3. MCP 서버 호출
    const mcpResponse = await this.mcpService.analyze(text);

    // 4. 응답 변환
    const factCheckId = uuidv4();
    const sentences = this.transformSentences(mcpResponse.sentences);
    const summary = this.calculateSummary(sentences);

    // 5. 로그인 사용자: DB 저장
    if (!user.isGuest) {
      await this.factCheckRepository.saveFactCheck(
        user.userId,
        factCheckId,
        mcpResponse.title,
        text,
        sentences,
      );
    }

    // 6. 게스트: 사용량 차감 (Atomic)
    if (user.isGuest) {
      await this.guestRepository.decrementRemainingUses(user.ip);
    }

    return {
      id: factCheckId,
      title: mcpResponse.title,
      originalText: text,
      sentences,
      summary,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * MCP 문장 배열을 클라이언트 친화적 구조로 변환
   * - startIndex 기준 정렬
   * - position 할당 (0부터 순차)
   * - excluded 타입 필터링
   * - startIndex, endIndex 제거
   * - 고유 ID 부여
   * - claim인 경우 status 추가
   */
  private transformSentences(mcpSentences: McpSentence[]): SentenceResponse[] {
    // 1. excluded 제외
    const filtered = mcpSentences.filter((s) => s.type !== "excluded");

    // 2. startIndex 기준 정렬
    const sorted = [...filtered].sort((a, b) => a.startIndex - b.startIndex);

    // 3. 변환 및 position 할당
    return sorted.map((sentence, index) => {
      if (sentence.type === "claim") {
        const claimResponse: ClaimSentenceResponse = {
          id: uuidv4(),
          type: "claim",
          text: sentence.text,
          position: index,
          verdict: sentence.verdict || "FALSE",
          suggestion: sentence.suggestion,
          sources: sentence.sources || [],
          status: "pending",
        };
        return claimResponse;
      } else {
        const opinionResponse: OpinionSentenceResponse = {
          id: uuidv4(),
          type: "opinion",
          text: sentence.text,
          position: index,
          reason: sentence.reason || "",
        };
        return opinionResponse;
      }
    });
  }

  /**
   * 요약 정보 계산
   */
  private calculateSummary(sentences: SentenceResponse[]): FactCheckSummary {
    let trueCount = 0;
    let falseCount = 0;
    let opinionCount = 0;

    for (const sentence of sentences) {
      if (sentence.type === "claim") {
        if (sentence.verdict === "TRUE") {
          trueCount++;
        } else {
          falseCount++;
        }
      } else {
        opinionCount++;
      }
    }

    return {
      total: sentences.length,
      true: trueCount,
      false: falseCount,
      opinion: opinionCount,
    };
  }
}
