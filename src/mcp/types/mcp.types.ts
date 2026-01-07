// MCP 서버가 반환하는 문장 타입
export type McpSentenceType = "claim" | "opinion" | "excluded";

// MCP 서버가 반환하는 Verdict 타입
export type McpVerdict = "TRUE" | "FALSE";

// MCP 서버가 반환하는 출처 정보
export interface McpSource {
  title: string;
  url: string;
  snippet?: string;
}

// MCP 서버가 반환하는 개별 문장 정보
export interface McpSentence {
  type: McpSentenceType;
  text: string;
  startIndex: number;
  endIndex: number;
  verdict?: McpVerdict;
  suggestion: string | null;
  sources?: McpSource[];
  reason?: string; // opinion인 경우
}

// MCP 서버의 전체 응답
export interface McpResponse {
  title: string;
  originalText: string;
  sentences: McpSentence[];
}
