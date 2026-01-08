import { Injectable } from "@nestjs/common";
import { ClaimStatus, Prisma, SentenceType, Verdict } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { SentenceResponse } from "../dto/factcheck-response.dto";

@Injectable()
export class FactCheckRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 팩트체크 결과를 DB에 저장
   */
  async saveFactCheck(
    userId: string,
    factCheckId: string,
    title: string,
    originalText: string,
    sentences: SentenceResponse[],
  ): Promise<void> {
    await this.prisma.factCheck.create({
      data: {
        id: factCheckId,
        userId,
        title,
        originalText,
        checkedCount: sentences.filter((s) => s.type === "claim").length,
        sentences: {
          create: sentences.map((sentence) => {
            if (sentence.type === "claim") {
              return {
                type: SentenceType.CLAIM,
                text: sentence.text,
                position: sentence.position,
                verdict: sentence.verdict as Verdict,
                suggestion: sentence.suggestion,
                sources: sentence.sources as unknown as Prisma.InputJsonValue,
                status: ClaimStatus.PENDING,
              };
            } else {
              return {
                type: SentenceType.OPINION,
                text: sentence.text,
                position: sentence.position,
                reason: sentence.reason,
              };
            }
          }),
        },
      },
    });
  }

  async findByUserId(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.factCheck.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          originalText: true,
          checkedCount: true,
          createdAt: true,
        },
      }),
      this.prisma.factCheck.count({ where: { userId } }),
    ]);

    return { items, total };
  }

  async findById(userId: string, factCheckId: string) {
    return this.prisma.factCheck.findFirst({
      where: {
        id: factCheckId,
        userId,
      },
      include: {
        sentences: {
          orderBy: { position: "asc" },
        },
      },
    });
  }

  async deleteById(userId: string, factCheckId: string): Promise<boolean> {
    const result = await this.prisma.factCheck.deleteMany({
      where: {
        id: factCheckId,
        userId,
      },
    });
    return result.count > 0;
  }
}
