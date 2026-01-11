import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { GoogleProfile } from "../../auth/types/auth.types";

/**
 * Google OAuth 인증된 사용자(GoogleProfile)를 반환하는 특수 데코레이터
 * 제네릭이나 캐스팅 없이 항상 GoogleProfile 타입을 반환합니다.
 */
export const GoogleUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GoogleProfile => {
    const request = ctx.switchToHttp().getRequest<{ user: GoogleProfile }>();
    // Guard에 의해 GoogleProfile이 보장된다고 가정
    return request.user;
  },
);
