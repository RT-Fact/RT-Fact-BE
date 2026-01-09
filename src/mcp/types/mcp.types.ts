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

// JSON-RPC 2.0 응답 타입 (MCP 서버 통신용)
interface JsonRpcContentItem {
  type: string;
  text: string;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string;
  result: {
    content: JsonRpcContentItem[];
  };
  error?: never;
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | null;
  result?: never;
  error: JsonRpcError;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
