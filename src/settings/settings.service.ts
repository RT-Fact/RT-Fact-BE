import { BadRequestException, Injectable } from "@nestjs/common";
import { ListType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    const filters = await this.prisma.domainFilter.findMany({
      where: { userId },
      select: { domain: true, listType: true },
    });

    const whitelist = filters.filter((f) => f.listType === ListType.WHITE).map((f) => f.domain);
    const blacklist = filters.filter((f) => f.listType === ListType.BLACK).map((f) => f.domain);

    return { whitelist, blacklist };
  }

  async addWhitelist(userId: string, domain: string) {
    await this.checkDomainConflict(userId, domain, ListType.WHITE);

    try {
      await this.prisma.domainFilter.create({
        data: {
          userId,
          domain,
          listType: ListType.WHITE,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException({
          code: "DUPLICATE_DOMAIN",
          message: "이미 등록된 도메인입니다",
        });
      }
      throw error;
    }

    return this.getWhitelist(userId);
  }

  async deleteWhitelist(userId: string, domain: string) {
    await this.prisma.domainFilter.deleteMany({
      where: {
        userId,
        domain,
        listType: ListType.WHITE,
      },
    });

    return this.getWhitelist(userId);
  }

  async addBlacklist(userId: string, domain: string) {
    await this.checkDomainConflict(userId, domain, ListType.BLACK);

    try {
      await this.prisma.domainFilter.create({
        data: {
          userId,
          domain,
          listType: ListType.BLACK,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException({
          code: "DUPLICATE_DOMAIN",
          message: "이미 등록된 도메인입니다",
        });
      }
      throw error;
    }

    return this.getBlacklist(userId);
  }

  async deleteBlacklist(userId: string, domain: string) {
    await this.prisma.domainFilter.deleteMany({
      where: {
        userId,
        domain,
        listType: ListType.BLACK,
      },
    });

    return this.getBlacklist(userId);
  }

  private async getWhitelist(userId: string) {
    const filters = await this.prisma.domainFilter.findMany({
      where: { userId, listType: ListType.WHITE },
      select: { domain: true },
    });

    return { whitelist: filters.map((f) => f.domain) };
  }

  private async getBlacklist(userId: string) {
    const filters = await this.prisma.domainFilter.findMany({
      where: { userId, listType: ListType.BLACK },
      select: { domain: true },
    });

    return { blacklist: filters.map((f) => f.domain) };
  }

  private async checkDomainConflict(userId: string, domain: string, targetType: ListType) {
    const conflictType = targetType === ListType.WHITE ? ListType.BLACK : ListType.WHITE;
    const conflict = await this.prisma.domainFilter.findFirst({
      where: {
        userId,
        domain,
        listType: conflictType,
      },
    });

    if (conflict) {
      throw new BadRequestException({
        code: "DOMAIN_CONFLICT",
        message: `해당 도메인은 ${conflictType === ListType.WHITE ? "화이트리스트" : "블랙리스트"}에 이미 존재합니다.`,
      });
    }
  }
}
