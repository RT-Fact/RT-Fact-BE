import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
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
      throw new UnauthorizedException("Invalid token payload");
    }

    return {
      userId: userPayload.id,
      email: userPayload.email,
      isGuest: false,
    };
  }
}
