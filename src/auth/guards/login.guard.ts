import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { REQUIRE_LOGIN_KEY } from "../../common/decorators/require-login.decorator";
import type { JwtUser } from "../types/auth.types";

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

    const request = context.switchToHttp().getRequest<{ user: JwtUser }>();
    const user = request.user;

    if (user.isGuest) {
      throw new ForbiddenException(ERROR_CODES.GUEST_NOT_ALLOWED);
    }

    return true;
  }
}
