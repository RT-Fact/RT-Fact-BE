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
    try {
      await this.prisma.domainFilter.create({
        data: {
          userId,
          domain,
          listType: ListType.WHITE,
        },
      });
    } catch (error) {
      // Prisma unique constraint violation
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

  private async getWhitelist(userId: string) {
    const filters = await this.prisma.domainFilter.findMany({
      where: { userId, listType: ListType.WHITE },
      select: { domain: true },
    });

    return { whitelist: filters.map((f) => f.domain) };
  }
}
