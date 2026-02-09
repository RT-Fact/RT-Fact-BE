import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { ERROR_CODES } from "../../common/constants/error-codes";

@Injectable()
export class SharedSecretGuard implements CanActivate {
  private readonly SECRET_HEADER_KEY = "x-internal-secret";

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secretFromHeader = request.headers[this.SECRET_HEADER_KEY];
    const internalSecret = this.configService.get<string>("INTERNAL_API_SECRET");

    if (!internalSecret) {
      return false;
    }
    if (typeof secretFromHeader !== "string" || secretFromHeader !== internalSecret) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_SHARED_SECRET);
    }

    return true;
  }
}
