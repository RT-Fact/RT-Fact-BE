import type { ErrorCode } from "./error-codes";

/**
 * 에러 코드 → 사용자 메시지 매핑
 *
 * Exception Filter에서 에러 코드를 사용자 친화적 메시지로 변환할 때 사용.
 * 새 에러 추가 시 error-codes.ts에도 코드 추가 필요.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Factcheck
  EMPTY_TEXT: "텍스트가 비어있습니다.",
  GUEST_LIMIT_EXCEEDED: "무료 사용 횟수를 모두 소진했습니다.",
  FACTCHECK_NOT_FOUND: "팩트체크 결과를 찾을 수 없습니다.",
  CLAIM_NOT_FOUND: "해당 항목을 찾을 수 없거나 이미 처리되었습니다.",

  // MCP
  MCP_ERROR: "팩트체크 서버 오류가 발생했습니다.",
  MCP_TIMEOUT: "팩트체크 서버 응답 시간이 초과되었습니다.",
  MCP_UNAVAILABLE: "팩트체크 서버에 연결할 수 없습니다.",

  // Auth
  TOKEN_EXPIRED: "토큰이 만료되었습니다.",
  TOKEN_INVALID: "유효하지 않은 토큰입니다.",
  INVALID_REFRESH_TOKEN: "유효하지 않은 리프레시 토큰입니다.",
  USER_NOT_FOUND: "사용자를 찾을 수 없습니다.",
  INVALID_AUTH_CODE: "유효하지 않거나 만료된 인증 코드입니다.",
  GUEST_NOT_ALLOWED: "게스트는 이 기능을 이용할 수 없습니다.",
  INVALID_SHARED_SECRET: "내부 통신 인증에 실패했습니다.",

  // Settings
  DUPLICATE_DOMAIN: "이미 등록된 도메인입니다.",
  DOMAIN_CONFLICT: "해당 도메인이 다른 목록에 이미 존재합니다.",
  INVALID_DOMAIN: "올바른 도메인 형식이 아닙니다.",

  // API Keys
  API_KEY_NOT_FOUND: "API 키를 찾을 수 없거나 접근 권한이 없습니다.",
  INVALID_API_KEY_FORMAT: "유효하지 않은 API 키 형식입니다.",
  API_KEY_LIMIT_EXCEEDED: "생성 가능한 API 키 개수를 초과했습니다.",

  // Validation
  VALIDATION_ERROR: "입력값이 올바르지 않습니다.",

  // 기본
  INTERNAL_SERVER_ERROR: "서버 오류가 발생했습니다.",
  BAD_REQUEST: "잘못된 요청입니다.",
};
