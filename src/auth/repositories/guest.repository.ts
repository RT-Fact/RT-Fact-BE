import { Injectable } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";
import { GuestInfo } from "../types/auth.types";
import { hashIp } from "../utils/ip-hash.util";

// TODO: 상수폴더를 생성해서 옮길지 환경변수로 뺄지 결정하기
const DEFAULT_GUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class GuestRepository {
  constructor(private readonly redisService: RedisService) {}

  async getGuestInfo(ip: string): Promise<GuestInfo | null> {
    const hashedIp = hashIp(ip);
    const data = await this.redisService.getClient().get(`guest:${hashedIp}`);

    if (!data) return null;

    return JSON.parse(data) as GuestInfo;
  }

  async setGuestInfo(
    ip: string,
    info: GuestInfo,
    ttlSeconds: number = DEFAULT_GUEST_TTL_SECONDS,
  ): Promise<void> {
    const hashedIp = hashIp(ip);
    await this.redisService
      .getClient()
      .set(`guest:${hashedIp}`, JSON.stringify(info), "EX", ttlSeconds);
  }
}
