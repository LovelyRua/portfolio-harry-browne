import { AuthUser } from './types';

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 100_000;

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${base64Url(salt)}$${base64Url(derived)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterationText, saltText, hashText] = encoded.split('$');
  if (algorithm !== 'pbkdf2-sha256' || !iterationText || !saltText || !hashText) return false;
  const iterations = Number(iterationText);
  if (!Number.isInteger(iterations) || iterations !== PASSWORD_ITERATIONS) return false;
  try {
    const actual = await derivePassword(password, fromBase64Url(saltText), iterations);
    return timingSafeEqual(actual, fromBase64Url(hashText));
  } catch {
    return false;
  }
}

export async function signToken(user: AuthUser, secret: string, issuer: string, expiresSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    sub: user.userId,
    email: user.email,
    tokenVersion: user.tokenVersion,
    iss: issuer,
    iat: now,
    exp: now + expiresSeconds,
  })));
  const input = `${header}.${payload}`;
  return `${input}.${base64Url(await hmac(input, secret))}`;
}

export async function verifyToken(token: string, secret: string, issuer: string): Promise<AuthUser | null> {
  const [headerText, payloadText, signatureText] = token.split('.');
  if (!headerText || !payloadText || !signatureText) return null;
  const input = `${headerText}.${payloadText}`;
  if (!timingSafeEqual(await hmac(input, secret), fromBase64Url(signatureText))) return null;

  try {
    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(headerText))) as { alg?: string };
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadText))) as {
      sub?: string;
      email?: string;
      tokenVersion?: number;
      iss?: string;
      exp?: number;
    };
    if (header.alg !== 'HS256' || payload.iss !== issuer || !payload.sub || !payload.email) return null;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return {
      userId: payload.sub,
      email: payload.email,
      tokenVersion: Number.isInteger(payload.tokenVersion) ? payload.tokenVersion! : 0,
    };
  } catch {
    return null;
  }
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

async function hmac(input: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(input)));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
