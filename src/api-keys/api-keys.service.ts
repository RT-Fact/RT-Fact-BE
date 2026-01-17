import * as crypto from "crypto";
import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ERROR_CODES } from "../common/constants/error-codes";
import { RedisService } from "../redis/redis.service";
import { API_KEY_CACHE_TTL, API_KEY_PREFIX, DEFAULT_MAX_API_KEYS } from "./constants";
import { CreateApiKeyDto } from "./dto/create-api-key.dto";
import { ApiKeysRepository } from "./repositories/api-keys.repository";
import type {
  ApiKeyInfo,
  ApiKeyVerificationResult,
  CreatedApiKeyInfo,
} from "./types/api-key.types";

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly apiKeysRepository: ApiKeysRepository,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async createApiKey(userId: string, createApiKeyDto: CreateApiKeyDto): Promise<CreatedApiKeyInfo> {
    const currentCount = await this.apiKeysRepository.countByUserId(userId);
    const maxKeys = this.configService.get<number>("API_KEY_MAX_PER_USER") || DEFAULT_MAX_API_KEYS;

    if (currentCount >= maxKeys) {
      throw new ForbiddenException(ERROR_CODES.API_KEY_LIMIT_EXCEEDED);
    }

    const randomPart = crypto.randomBytes(16).toString("hex");
    const apiKey = `${API_KEY_PREFIX}${randomPart}`;
    const keyPrefix = apiKey.substring(0, 8);
    const keyHash = this.hashKey(apiKey);

    const savedKey = await this.apiKeysRepository.create({
      userId,
      name: createApiKeyDto.name,
      keyHash,
      keyPrefix,
    });

    this.logger.log(`API Key created for user ${userId}: ${savedKey.id}`);

    return {
      id: savedKey.id,
      name: savedKey.name,
      prefix: keyPrefix,
      secretKey: apiKey,
      createdAt: savedKey.createdAt,
    };
  }

  async listApiKeys(userId: string): Promise<ApiKeyInfo[]> {
    const keys = await this.apiKeysRepository.findByUserId(userId);
    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.keyPrefix,
      createdAt: key.createdAt,
    }));
  }

  async deleteApiKey(userId: string, id: string): Promise<{ success: boolean }> {
    const key = await this.apiKeysRepository.findById(id);

    if (!key || key.userId !== userId) {
      throw new NotFoundException(ERROR_CODES.API_KEY_NOT_FOUND);
    }

    await this.apiKeysRepository.delete(id);

    const cacheKey = `auth:apikey:${key.keyPrefix}`;
    await this.redisService.del(cacheKey);

    this.logger.log(`API Key deleted: ${id}`);

    return { success: true };
  }

  async verifyApiKey(apiKey: string): Promise<ApiKeyVerificationResult> {
    if (!apiKey || !apiKey.startsWith(API_KEY_PREFIX)) {
      return { valid: false };
    }

    const prefix = apiKey.substring(0, 8);
    const cacheKey = `auth:apikey:${prefix}`;
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      try {
        return (
          typeof cached === "string" ? JSON.parse(cached) : cached
        ) as ApiKeyVerificationResult;
      } catch (error) {
        this.logger.warn(`Cache parsing failed for key ${prefix}: ${error}`);
        await this.redisService.del(cacheKey);
      }
    }

    const keyRecord = await this.apiKeysRepository.findByPrefix(prefix);
    if (!keyRecord) {
      await this.cacheVerificationResult(cacheKey, { valid: false });
      return { valid: false };
    }

    if (!this.verifyHash(apiKey, keyRecord.keyHash)) {
      await this.cacheVerificationResult(cacheKey, { valid: false });
      return { valid: false };
    }

    const result: ApiKeyVerificationResult = { valid: true, userId: keyRecord.userId };
    await this.cacheVerificationResult(cacheKey, result);
    return result;
  }

  private hashKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  private verifyHash(inputKey: string, storedHash: string): boolean {
    const inputHash = this.hashKey(inputKey);
    const inputBuffer = Buffer.from(inputHash, "utf-8");
    const storedBuffer = Buffer.from(storedHash, "utf-8");

    if (inputBuffer.length !== storedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(inputBuffer, storedBuffer);
  }

  private async cacheVerificationResult(key: string, result: ApiKeyVerificationResult) {
    await this.redisService.set(key, JSON.stringify(result), API_KEY_CACHE_TTL);
  }
}
