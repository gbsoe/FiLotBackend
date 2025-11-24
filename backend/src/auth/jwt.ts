import { Request } from 'express';

export class JWTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JWTError';
  }
}

export const getBearerToken = (req: Request): string => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new JWTError('No authorization header provided');
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new JWTError('Invalid authorization header format. Expected: Bearer <token>');
  }

  const token = parts[1];

  if (!token) {
    throw new JWTError('Token is empty');
  }

  return token;
};
