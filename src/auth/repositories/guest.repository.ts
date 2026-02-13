import { Injectable } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";
import { GUEST_CONFIG } from "../constants";
import type { GuestInfo } from "../types/auth.types";

@Injectable()
export class GuestRepository {
  constructor(private readonly redisService: RedisService) {}

  /**
   * 게스트 정보 조회 (Redis Hash)
   * @param hashedIp - 해싱된 IP (controller에서 hashIp() 적용 후 전달)
   */
  async getGuestInfo(hashedIp: string): Promise<GuestInfo | null> {
    const data = await this.redisService.getClient().hgetall(`guest:${hashedIp}`);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      remainingUses: parseInt(data.remainingUses, 10),
      createdAt: parseInt(data.createdAt, 10),
    };
  }

  /**
   * 게스트 정보 저장 (Redis Hash)
   * @param hashedIp - 해싱된 IP (controller에서 hashIp() 적용 후 전달)
   */
  async setGuestInfo(
    hashedIp: string,
    info: GuestInfo,
    ttlSeconds: number = GUEST_CONFIG.TTL_SECONDS,
  ): Promise<void> {
    const key = `guest:${hashedIp}`;

    await this.redisService.getClient().hset(key, {
      remainingUses: info.remainingUses.toString(),
      createdAt: info.createdAt.toString(),
    });
    await this.redisService.getClient().expire(key, ttlSeconds);
  }

  /**
   * 게스트 남은 사용량 차감 (Atomic Operation)
   * @param hashedIp - 해싱된 IP (controller에서 hashIp() 적용 후 전달)
   * @returns 차감 후 남은 사용량
   */
  async decrementRemainingUses(hashedIp: string): Promise<number> {
    const remaining = await this.redisService
      .getClient()
      .hincrby(`guest:${hashedIp}`, "remainingUses", -1);
    return remaining;
  }
}
