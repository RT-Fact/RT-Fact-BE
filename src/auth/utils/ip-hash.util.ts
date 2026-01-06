import * as crypto from "crypto";

/**
 * IP 주소를 HMAC-SHA256으로 해싱합니다.
 * 개인정보 보호를 위해 원본 IP 대신 해시값을 Redis 키로 사용합니다.
 *
 * @param ip - 해싱할 IP 주소
 * @returns 64자리 hex 문자열
 */
export function hashIp(ip: string): string {
  const key = process.env.IP_SECRET_KEY;

  if (!key) {
    throw new Error("IP_SECRET_KEY is not defined in environment variables");
  }

  return crypto.createHmac("sha256", key).update(ip).digest("hex");
}
