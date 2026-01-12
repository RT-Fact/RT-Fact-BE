import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { GuestJwtPayload, JwtUser, UserJwtPayload } from "../types/auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>("JWT_SECRET"),
    });
  }

  validate(payload: UserJwtPayload | GuestJwtPayload): JwtUser {
    if ("isGuest" in payload) {
      return {
        ip: payload.ip,
        isGuest: true,
      };
    }

    const userPayload = payload;

    if (!userPayload.id || !userPayload.email) {
      throw new UnauthorizedException(ERROR_CODES.TOKEN_INVALID);
    }

    return {
      userId: userPayload.id,
      email: userPayload.email,
      isGuest: false,
    };
  }
}
