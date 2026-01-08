import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRE_LOGIN_KEY } from "../../common/decorators/require-login.decorator";
import type { RequestUser } from "../../factcheck/types/factcheck.types";

@Injectable()
export class LoginGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requireLogin = this.reflector.getAllAndOverride<boolean>(REQUIRE_LOGIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requireLogin) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: RequestUser }>();
    const user = request.user;

    if (user.isGuest) {
      throw new ForbiddenException({
        error: "GUEST_NOT_ALLOWED",
        message: "게스트는 이 기능을 이용할 수 없습니다.",
      });
    }

    return true;
  }
}
