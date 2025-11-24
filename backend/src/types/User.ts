export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
  mobile?: string | null;
  ktpUrl?: string | null;
  npwpUrl?: string | null;
  role?: string;
}

export interface JWTPayload {
  sub: string;
  email?: string;
  iat?: number;
  exp?: number;
  [key: string]: any;
}

export interface TokenRefreshRequest {
  refreshToken: string;
}

export interface TokenRefreshResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
