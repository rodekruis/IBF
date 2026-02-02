import { applyDecorators, HttpStatus, SetMetadata } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export interface AuthenticatedUserParameters {
  isAdmin?: boolean;
  readonly isGuarded?: boolean;
}

export const AuthenticatedUser = (parameters?: AuthenticatedUserParameters) => {
  let permissionsDescription = '';
  if (parameters?.isAdmin) {
    permissionsDescription = 'User must be an admin.';
  }

  return applyDecorators(
    SetMetadata('authenticationParameters', {
      ...parameters,
      isGuarded: true,
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: `User does not have the right permission to access this endpoint. \n (${permissionsDescription})`,
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Not authenticated.',
    }),
  );
};
