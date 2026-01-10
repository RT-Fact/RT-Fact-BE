import { Injectable } from "@nestjs/common";
import { ListType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DomainFilterRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 사용자별 필터 목록 조회
   */
  async findFiltersByUserId(userId: string) {
    return this.prisma.domainFilter.findMany({
      where: { userId },
      select: { domain: true, listType: true },
    });
  }

  /**
   * 특정 타입의 필터 목록 조회 (Whitelist/Blacklist)
   */
  async findFiltersByType(userId: string, listType: ListType) {
    return this.prisma.domainFilter.findMany({
      where: { userId, listType },
      select: { domain: true },
    });
  }

  /**
   * 필터 생성
   */
  async createFilter(userId: string, domain: string, listType: ListType) {
    return this.prisma.domainFilter.create({
      data: {
        userId,
        domain,
        listType,
      },
    });
  }

  /**
   * 필터 삭제
   */
  async deleteFilter(userId: string, domain: string, listType: ListType) {
    return this.prisma.domainFilter.deleteMany({
      where: {
        userId,
        domain,
        listType,
      },
    });
  }

  /**
   * 특정 필터 존재 여부 확인 (충돌 체크용)
   */
  async findFilter(userId: string, domain: string, listType: ListType) {
    return this.prisma.domainFilter.findFirst({
      where: {
        userId,
        domain,
        listType,
      },
    });
  }
}
