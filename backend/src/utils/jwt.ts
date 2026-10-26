import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type JwtClaims = {
  sub: string;
  email: string;
  roleCode: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
};

export const JWT_ISSUER = 'prodora-api';
export const JWT_AUDIENCE = 'prodora-app';

export function signAccessToken(
  claims: Omit<JwtClaims, 'iat' | 'exp' | 'iss' | 'aud'>,
): string {
  const payload: JwtClaims = {
    ...claims,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + Number(env.JWT_ACCESS_TTL_MS) / 1000,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };
  // `iss`/`aud` live in the payload, so they must NOT be repeated as sign
  // options (jsonwebtoken rejects that combination).
  return jwt.sign(payload, env.JWT_ACCESS_SECRET);
}

export function verifyAccessToken(token: string): JwtClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtClaims;
  return decoded;
}
