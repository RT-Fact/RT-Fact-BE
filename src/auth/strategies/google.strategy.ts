import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Profile, Strategy, VerifyCallback } from "passport-google-oauth20";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>("GOOGLE_CLIENT_ID"),
      clientSecret: configService.getOrThrow<string>("GOOGLE_CLIENT_SECRET"),
      callbackURL: configService.getOrThrow<string>("GOOGLE_CALLBACK_URL"),
      scope: ["email", "profile"],
    });
  }

  /**
   * Google 인증 성공 후 호출되는 메서드
   * @param accessToken - Google에서 발급한 Access Token (사용하지 않음)
   * @param refreshToken - Google에서 발급한 Refresh Token (사용하지 않음)
   * @param profile - Google 사용자 프로필 정보
   * @param done - Passport 콜백 함수
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { id, displayName, emails } = profile;

    const user = {
      email: emails?.[0].value,
      name: displayName,
      provider: "google",
      providerId: id,
    };

    // req.user에 사용자 정보 저장
    done(null, user);
  }
}
