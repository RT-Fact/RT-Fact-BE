import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../../auth/types/auth.types";

/**
 * @RequireLogin() 데코레이터와 함께 사용
 * Guard가 게스트 접근을 차단하므로 AuthenticatedUser 타입 보장
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
