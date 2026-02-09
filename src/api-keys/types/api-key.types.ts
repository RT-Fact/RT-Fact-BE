export interface ApiKeyVerificationResult {
  valid: boolean;
  userId?: string;
}

export interface CreatedApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  secretKey: string;
  createdAt: Date;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
}
