import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

jest.mock('@api-service/src/env', () => ({
  env: { PIPELINE_API_KEY: undefined as string | undefined },
}));

const mockEnv = jest.requireMock<{
  env: { PIPELINE_API_KEY: string | undefined };
}>('@api-service/src/env').env;

const mockAuthGuardCanActivate = jest.fn();
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    class MockAuthGuard {
      canActivate(context: ExecutionContext): boolean {
        return mockAuthGuardCanActivate(context);
      }
    }
    return MockAuthGuard;
  },
}));

import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

describe('AuthenticatedUserGuard', () => {
  let guard: AuthenticatedUserGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    mockAuthGuardCanActivate.mockReset();
    mockEnv.PIPELINE_API_KEY = undefined;

    const module = await Test.createTestingModule({
      providers: [
        AuthenticatedUserGuard,
        {
          provide: Reflector,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get(AuthenticatedUserGuard);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if endpoint is not guarded', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ isGuarded: false });

    // Updated mock for ExecutionContext to include getHandler
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
      getHandler: () => ({}), // Mock getHandler as an empty function
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should call super.canActivate if endpoint is guarded', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({ isGuarded: true });
    mockAuthGuardCanActivate.mockReturnValue(true);

    // Ensure this mock also includes getHandler
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
      getHandler: () => ({}), // Mock getHandler as an empty function
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(context)).toBe(true);
    expect(mockAuthGuardCanActivate).toHaveBeenCalledWith(context);
  });

  describe('API key authentication', () => {
    function buildContext(
      headers: Record<string, string> = {},
    ): ExecutionContext {
      const request = { headers, authenticationParameters: undefined };
      return {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
        getHandler: () => ({}),
      } as unknown as ExecutionContext;
    }

    it('should allow access with valid API key', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({ isGuarded: true });
      mockEnv.PIPELINE_API_KEY = 'a'.repeat(32);

      const context = buildContext({ 'x-api-key': 'a'.repeat(32) });
      expect(await guard.canActivate(context)).toBe(true);
    });

    it('should reject invalid API key and fall through to JWT', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({ isGuarded: true });
      mockEnv.PIPELINE_API_KEY = 'a'.repeat(32);
      mockAuthGuardCanActivate.mockReturnValue(false);

      const context = buildContext({ 'x-api-key': 'b'.repeat(32) });
      expect(await guard.canActivate(context)).toBe(false);
      expect(mockAuthGuardCanActivate).toHaveBeenCalled();
    });

    it('should fall through to JWT when no API key configured', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({ isGuarded: true });
      mockEnv.PIPELINE_API_KEY = undefined;
      mockAuthGuardCanActivate.mockReturnValue(true);

      const context = buildContext({ 'x-api-key': 'some-key' });
      expect(await guard.canActivate(context)).toBe(true);
      expect(mockAuthGuardCanActivate).toHaveBeenCalled();
    });
  });
});
