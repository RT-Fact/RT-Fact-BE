import { Injectable } from "@nestjs/common";
import { ApiKey } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ApiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
  }): Promise<ApiKey> {
    return this.prisma.apiKey.create({
      data,
    });
  }

  async findByUserId(userId: string): Promise<ApiKey[]> {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async countByUserId(userId: string): Promise<number> {
    return this.prisma.apiKey.count({
      where: { userId },
    });
  }

  async findByPrefix(keyPrefix: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findFirst({
      where: { keyPrefix },
    });
  }

  async findById(id: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<ApiKey> {
    return this.prisma.apiKey.delete({ where: { id } });
  }
}
