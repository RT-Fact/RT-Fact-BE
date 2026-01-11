import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import type { ErrorCode } from "../constants/error-codes";
import { ERROR_MESSAGES } from "../constants/error-messages";

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  stack?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isDev: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isDev = this.configService.get("NODE_ENV") !== "production";
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const isServerError = status >= 500;

    const actualError = this.extractErrorInfo(exception, status);

    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${actualError.code}: ${actualError.message}`,
    );

    if (isServerError && exception instanceof Error) {
      this.logger.error(exception.stack);
    } else if (exception instanceof Error && this.isDev) {
      this.logger.debug(exception.stack);
    }

    const clientError = isServerError
      ? { code: "INTERNAL_SERVER_ERROR", message: "서버 오류가 발생했습니다." }
      : actualError;

    const errorResponse: ErrorResponse = {
      statusCode: isServerError ? 500 : status,
      code: clientError.code,
      message: clientError.message,
    };

    // Development 환경에서만 stack trace 포함 (4xx에 한해)
    if (this.isDev && !isServerError && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  /**
   * Exception에서 code와 message 추출
   * - 문자열 에러 코드 → ERROR_MESSAGES에서 메시지 조회
   * - 기타 → 기본 메시지 사용
   */
  private extractErrorInfo(exception: unknown, status: number): { code: string; message: string } {
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        const code = exceptionResponse as ErrorCode;
        const message = ERROR_MESSAGES[code] ?? exceptionResponse;
        return { code, message };
      }

      if (this.isValidationError(exceptionResponse)) {
        const firstMessage = Array.isArray(exceptionResponse.message)
          ? exceptionResponse.message[0]
          : exceptionResponse.message;
        return {
          code: "VALIDATION_ERROR",
          message: firstMessage ?? "입력값이 올바르지 않습니다.",
        };
      }
    }

    return {
      code: this.getDefaultCode(status),
      message: this.getDefaultMessage(status),
    };
  }

  private isValidationError(
    response: unknown,
  ): response is { message: string | string[]; error?: string } {
    return (
      typeof response === "object" &&
      response !== null &&
      "message" in response &&
      (!("error" in response) || (response as { error?: string }).error === "Bad Request")
    );
  }

  /**
   * NestJS/라이브러리 내부에서 던지는 에러용 폴백
   */
  private getDefaultCode(status: number): string {
    const codeMap: Record<number, string> = {
      400: "BAD_REQUEST",
      401: "TOKEN_INVALID",
      403: "GUEST_NOT_ALLOWED",
      404: "NOT_FOUND",
      409: "CONFLICT",
    };
    return codeMap[status] ?? "INTERNAL_SERVER_ERROR";
  }

  private getDefaultMessage(status: number): string {
    const messageMap: Record<number, string> = {
      400: "잘못된 요청입니다.",
      401: "인증이 필요합니다.",
      403: "접근이 거부되었습니다.",
      404: "리소스를 찾을 수 없습니다.",
      409: "요청이 현재 상태와 충돌합니다.",
    };
    return messageMap[status] ?? "서버 오류가 발생했습니다.";
  }
}
