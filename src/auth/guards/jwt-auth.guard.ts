import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser, info: unknown): TUser {
    if (err || !user) {
      const errorCode =
        info instanceof Error && info.name === "TokenExpiredError"
          ? ERROR_CODES.TOKEN_EXPIRED
          : ERROR_CODES.TOKEN_INVALID;

      throw err || new UnauthorizedException(errorCode);
    }
    return user;
  }
}
