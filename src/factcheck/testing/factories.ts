import type { FactCheck, Sentence } from "@prisma/client";
import type { ClaimSentenceResponse, OpinionSentenceResponse } from "../dto/factcheck-response.dto";

export type FactCheckWithSentences = FactCheck & { sentences: Sentence[] };

export const createDbClaim = (overrides?: Partial<Sentence>): Sentence => ({
  id: "1",
  type: "CLAIM",
  text: "검증 문장",
  position: 0,
  verdict: "TRUE",
  suggestion: null,
  sources: [{ title: "출처", url: "https://example.com" }],
  status: "PENDING",
  reason: null,
  factCheckId: "fc-123",
  ...overrides,
});

export const createDbOpinion = (overrides?: Partial<Sentence>): Sentence => ({
  id: "2",
  type: "OPINION",
  text: "의견 문장",
  position: 0,
  verdict: null,
  suggestion: null,
  sources: null,
  status: null,
  reason: "주관적 표현",
  factCheckId: "fc-123",
  ...overrides,
});

export const createDbFactCheck = (
  overrides?: Partial<FactCheckWithSentences>,
): FactCheckWithSentences => ({
  id: "fc-123",
  title: "제목",
  originalText: "텍스트",
  checkedCount: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  userId: "user-123",
  sentences: [],
  ...overrides,
});

export const createClaimResponse = (
  overrides?: Partial<ClaimSentenceResponse>,
): ClaimSentenceResponse => ({
  id: "claim-1",
  type: "claim",
  text: "검증 가능한 문장",
  position: 0,
  verdict: "TRUE",
  suggestion: null,
  sources: [{ title: "출처", url: "https://example.com" }],
  status: "pending",
  ...overrides,
});

export const createOpinionResponse = (
  overrides?: Partial<OpinionSentenceResponse>,
): OpinionSentenceResponse => ({
  id: "opinion-1",
  type: "opinion",
  text: "의견 문장",
  position: 1,
  reason: "주관적 표현",
  ...overrides,
});
