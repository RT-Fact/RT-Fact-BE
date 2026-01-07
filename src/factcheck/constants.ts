import type { ClaimStatus } from "@prisma/client";
import type { ClaimStatusResponse } from "./dto/factcheck-response.dto";

// Prisma ClaimStatus enum → API 응답 매핑
export const CLAIM_STATUS_MAP: Record<ClaimStatus, ClaimStatusResponse> = {
  PENDING: "pending",
  APPLIED: "applied",
  IGNORED: "ignored",
};
