import type { RequestWithUser } from "../../auth/types/auth.types";

/**
 * 팩트체크 요청에 필요한 속성만 포함
 */
export type FactCheckRequest = Pick<RequestWithUser, "user">;
