// 변환된 출처 정보
export interface FactCheckSource {
  title: string;
  url: string;
  snippet?: string;
}

// 변환된 문장 (공통 필드)
export interface BaseSentenceResponse {
  id: string;
  type: "claim" | "opinion";
  text: string;
  position: number;
}

// Claim 문장 응답
export interface ClaimSentenceResponse extends BaseSentenceResponse {
  type: "claim";
  verdict: "TRUE" | "FALSE";
  suggestion?: string;
  sources: FactCheckSource[];
  status: "pending" | "applied" | "ignored";
}

// Opinion 문장 응답
export interface OpinionSentenceResponse extends BaseSentenceResponse {
  type: "opinion";
  reason: string;
}

export type SentenceResponse = ClaimSentenceResponse | OpinionSentenceResponse;

// 요약 정보
export interface FactCheckSummary {
  total: number;
  true: number;
  false: number;
  opinion: number;
}

// 전체 팩트체크 응답
export interface FactCheckResponse {
  id: string;
  title: string;
  originalText: string;
  sentences: SentenceResponse[];
  summary: FactCheckSummary;
  createdAt: string;
}
