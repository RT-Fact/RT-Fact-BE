import { Injectable } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";
import { GuestInfo } from "../types/auth.types";
import { hashIp } from "../utils/ip-hash.util";

// TODO: 상수폴더를 생성해서 옮길지 환경변수로 뺄지 결정하기
const DEFAULT_GUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class GuestRepository {
  constructor(private readonly redisService: RedisService) {}

  /**
   * 게스트 정보 조회 (Redis Hash)
   */
  async getGuestInfo(ip: string): Promise<GuestInfo | null> {
    const hashedIp = hashIp(ip);
    const data = await this.redisService.getClient().hgetall(`guest:${hashedIp}`);

    if (!data || Object.keys(data).length === 0) return null;

    return {
      remainingUses: parseInt(data.remainingUses, 10),
      createdAt: parseInt(data.createdAt, 10),
    };
  }

  /**
   * 게스트 정보 저장 (Redis Hash)
   */
  async setGuestInfo(
    ip: string,
    info: GuestInfo,
    ttlSeconds: number = DEFAULT_GUEST_TTL_SECONDS,
  ): Promise<void> {
    const hashedIp = hashIp(ip);
    const key = `guest:${hashedIp}`;

    await this.redisService.getClient().hset(key, {
      remainingUses: info.remainingUses.toString(),
      createdAt: info.createdAt.toString(),
    });
    await this.redisService.getClient().expire(key, ttlSeconds);
  }

  /**
   * 게스트 남은 사용량 차감 (Atomic Operation)
   * @returns 차감 후 남은 사용량
   */
  async decrementRemainingUses(ip: string): Promise<number> {
    const hashedIp = hashIp(ip);
    const remaining = await this.redisService
      .getClient()
      .hincrby(`guest:${hashedIp}`, "remainingUses", -1);
    return remaining;
  }
}
