import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';

import { env } from '@api-service/src/env';
import { AuthenticatedUserParameters } from '@api-service/src/guards/authenticated-user.decorator';

// Authentication guard that supports two mechanisms:
// 1. JWT cookie auth (default) — delegates to Passport's cookie-jwt strategy
// 2. Pipeline API key auth (opt-in) — allows pipelines to authenticate via
//    the x-api-key header instead of JWT. Only enabled on endpoints that set
//    allowPipelineApiKey: true in @AuthenticatedUser().
@Injectable()
export class AuthenticatedUserGuard
  extends AuthGuard(['cookie-jwt'])
  implements CanActivate
{
  public constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const endpointParameters = this.reflector.get<AuthenticatedUserParameters>(
      'authenticationParameters',
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest();
    request.authenticationParameters = endpointParameters;
    if (!endpointParameters?.isGuarded) {
      return true;
    }
    // Only check API key if the endpoint explicitly opts in. This prevents
    // the API key from bypassing JWT/role checks on other endpoints.
    if (endpointParameters.allowPipelineApiKey && this.isValidApiKey(request)) {
      return true;
    }
    // Fall through to JWT cookie authentication
    return super.canActivate(context);
  }

  private isValidApiKey(request: {
    headers: Record<string, string | string[] | undefined>;
  }): boolean {
    const expected = env.PIPELINE_API_KEY;
    if (!expected) {
      return false;
    }
    const raw = request.headers['x-api-key'];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (!provided) {
      return false;
    }
    const a = Buffer.from(expected, 'utf-8');
    const b = Buffer.from(provided, 'utf-8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
