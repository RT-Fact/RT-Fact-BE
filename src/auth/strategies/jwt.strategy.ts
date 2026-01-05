import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwtPayload } from "../types/auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  /**
   * JWT 검증 성공 후 호출되는 메서드
   * @param payload - JWT 페이로드 (id, email 등)
   * @returns req.user에 저장될 사용자 정보
   */
  validate(payload: JwtPayload): { userId: string; email: string } {
    if (!payload.id || !payload.email) {
      throw new UnauthorizedException("Invalid token payload");
    }

    return {
      userId: payload.id,
      email: payload.email,
    };
  }
}
