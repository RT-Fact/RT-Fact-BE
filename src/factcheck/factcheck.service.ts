import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Sentence } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { GuestRepository } from "../auth/repositories/guest.repository";
import { McpService } from "../mcp/mcp.service";
import type { McpSentence } from "../mcp/types/mcp.types";
import { CLAIM_STATUS_MAP } from "./constants";
import type { FactCheckListResponse } from "./dto/factcheck-list-response.dto";
import type {
  ClaimSentenceResponse,
  FactCheckResponse,
  FactCheckSource,
  FactCheckSummary,
  OpinionSentenceResponse,
  SentenceResponse,
} from "./dto/factcheck-response.dto";
import type { GetFactCheckListQueryDto } from "./dto/pagination-query.dto";
import { FactCheckRepository } from "./repositories/factcheck.repository";
import type { AuthenticatedUser, RequestUser } from "./types/factcheck.types";

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
    const userId = user.isGuest ? `guest:${user.ip}` : user.userId;
    this.logger.log(`팩트체크 요청 시작 - 사용자: ${userId}, 텍스트 길이: ${text.length}`);

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
      try {
        await this.factCheckRepository.saveFactCheck(
          user.userId,
          factCheckId,
          mcpResponse.title,
          text,
          sentences,
        );
      } catch (error) {
        this.logger.error(
          `DB 저장 실패 - 사용자: ${userId}, factCheckId: ${factCheckId}`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      }
    }

    // 6. 게스트: 사용량 차감 (Atomic)
    if (user.isGuest) {
      await this.guestRepository.decrementRemainingUses(user.ip);
    }

    this.logger.log(
      `팩트체크 완료 - 사용자: ${userId}, 문장 수: ${sentences.length}, 요약: TRUE=${summary.true}, FALSE=${summary.false}, OPINION=${summary.opinion}`,
    );

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
   * DB Sentence 엔티티를 API 응답 형식으로 변환
   */
  private transformDbSentenceToResponse(s: Sentence): SentenceResponse {
    if (s.type === "CLAIM") {
      return {
        id: s.id.toString(),
        type: "claim" as const,
        text: s.text,
        position: s.position,
        verdict: s.verdict ?? "FALSE",
        sources: (s.sources as unknown as FactCheckSource[]) ?? [],
        suggestion: s.suggestion,
        status: s.status ? CLAIM_STATUS_MAP[s.status] : "pending",
      };
    }
    return {
      id: s.id.toString(),
      type: "opinion" as const,
      text: s.text,
      position: s.position,
      reason: s.reason || "",
    };
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

  async getFactCheckList(
    user: AuthenticatedUser,
    query: GetFactCheckListQueryDto,
  ): Promise<FactCheckListResponse> {
    const { items, total } = await this.factCheckRepository.findByUserId(
      user.userId,
      query.page,
      query.limit,
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        preview: item.originalText.slice(0, 100),
        checkedCount: item.checkedCount,
        createdAt: item.createdAt.toISOString(),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getFactCheckById(user: AuthenticatedUser, factCheckId: string): Promise<FactCheckResponse> {
    const factCheck = await this.factCheckRepository.findById(user.userId, factCheckId);

    if (!factCheck) {
      throw new NotFoundException({
        error: "FACTCHECK_NOT_FOUND",
        message: "팩트체크 결과를 찾을 수 없습니다.",
      });
    }

    const sentences = factCheck.sentences.map((s) => this.transformDbSentenceToResponse(s));

    const summary = this.calculateSummary(sentences);

    return {
      id: factCheck.id,
      title: factCheck.title,
      originalText: factCheck.originalText,
      sentences,
      summary,
      createdAt: factCheck.createdAt.toISOString(),
    };
  }

  async deleteFactCheck(
    user: AuthenticatedUser,
    factCheckId: string,
  ): Promise<{ success: boolean }> {
    const deleted = await this.factCheckRepository.deleteById(user.userId, factCheckId);

    if (!deleted) {
      throw new NotFoundException({
        error: "FACTCHECK_NOT_FOUND",
        message: "팩트체크 결과를 찾을 수 없습니다.",
      });
    }

    return { success: true };
  }
}
