import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';

import { env } from '@api-service/src/env';
import { AuthenticatedUserParameters } from '@api-service/src/guards/authenticated-user.decorator';

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
    if (this.isValidApiKey(request)) {
      return true;
    }
    return super.canActivate(context);
  }

  private isValidApiKey(request: { headers: Record<string, string> }): boolean {
    const expected = env.PIPELINE_API_KEY;
    if (!expected) {
      return false;
    }
    const provided = request.headers['x-api-key'];
    if (!provided) {
      return false;
    }
    const a = Buffer.from(expected, 'utf-8');
    const b = Buffer.from(provided, 'utf-8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
