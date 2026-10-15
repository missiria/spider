import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

export const CLIENT_IP_HEADER = 'x-spider-client-ip';
export const PROXY_SECRET_HEADER = 'x-spider-proxy-secret';

/**
 * Rate-limit key = the real client IP. Behind our own Next server the API only sees the
 * server's address, so Next forwards the client IP in `x-spider-client-ip` together with
 * `x-spider-proxy-secret` (shared INTERNAL_PROXY_SECRET). The header is honoured only when
 * the secret matches; a spoofed header from anywhere else falls back to the socket address.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return clientIp(req);
  }
}

export function clientIp(req: Request): string {
  const secret = process.env.INTERNAL_PROXY_SECRET ?? '';
  const provided = req.headers[PROXY_SECRET_HEADER];
  const forwarded = req.headers[CLIENT_IP_HEADER];
  if (
    secret &&
    typeof provided === 'string' &&
    typeof forwarded === 'string' &&
    safeEqual(provided, secret) &&
    forwarded.trim()
  ) {
    return forwarded.trim().slice(0, 64);
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** This parameter decorator reads the trusted client IP for logging. */
import { createParamDecorator } from '@nestjs/common';
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    clientIp(ctx.switchToHttp().getRequest<Request>()),
);
