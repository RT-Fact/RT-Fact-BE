import { ConflictException, Injectable } from "@nestjs/common";
import { ListType, Prisma } from "@prisma/client";
import { ERROR_CODES } from "../common/constants/error-codes";
import { DomainFilterRepository } from "./repositories/domain-filter.repository";

@Injectable()
export class SettingsService {
  constructor(private readonly repository: DomainFilterRepository) {}

  async getSettings(userId: string) {
    const filters = await this.repository.findFiltersByUserId(userId);

    const whitelist = filters.filter((f) => f.listType === ListType.WHITE).map((f) => f.domain);
    const blacklist = filters.filter((f) => f.listType === ListType.BLACK).map((f) => f.domain);

    return { whitelist, blacklist };
  }

  async addWhitelist(userId: string, domain: string) {
    return this.addFilter(userId, domain, ListType.WHITE);
  }

  async addBlacklist(userId: string, domain: string) {
    return this.addFilter(userId, domain, ListType.BLACK);
  }

  async deleteWhitelist(userId: string, domain: string) {
    return this.deleteFilter(userId, domain, ListType.WHITE);
  }

  async deleteBlacklist(userId: string, domain: string) {
    return this.deleteFilter(userId, domain, ListType.BLACK);
  }

  private async addFilter(userId: string, domain: string, listType: ListType) {
    await this.checkDomainConflict(userId, domain, listType);

    try {
      await this.repository.createFilter(userId, domain, listType);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(ERROR_CODES.DUPLICATE_DOMAIN);
      }
      throw error;
    }

    return this.getFilterList(userId, listType);
  }

  private async deleteFilter(userId: string, domain: string, listType: ListType) {
    await this.repository.deleteFilter(userId, domain, listType);
    return this.getFilterList(userId, listType);
  }

  private async getFilterList(userId: string, listType: ListType) {
    const filters = await this.repository.findFiltersByType(userId, listType);
    const list = filters.map((f) => f.domain);
    return listType === ListType.WHITE ? { whitelist: list } : { blacklist: list };
  }

  private async checkDomainConflict(userId: string, domain: string, targetType: ListType) {
    const conflictType = targetType === ListType.WHITE ? ListType.BLACK : ListType.WHITE;
    const conflict = await this.repository.findFilter(userId, domain, conflictType);

    if (conflict) {
      throw new ConflictException(ERROR_CODES.DOMAIN_CONFLICT);
    }
  }
}
