import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';

import { UserApiService } from '~/domains/user/user.api.service';
import { IAuthStrategy } from '~/services/auth/auth-strategy.interface';
import { BasicAuthLoginComponent } from '~/services/auth/strategies/basic-auth/basic-auth.login.component';
import { LocalStorageUser } from '~/utils/local-storage';

@Injectable({
  providedIn: 'root',
})
export class BasicAuthStrategy implements IAuthStrategy {
  static readonly APP_PROVIDERS = [];
  private readonly userApiService = inject(UserApiService);
  private readonly router = inject(Router);

  public LoginComponent = BasicAuthLoginComponent;

  public initializeSubscriptions() {
    // Not applicable for basic auth
    return [];
  }

  public async login(credentials: { username: string; password: string }) {
    try {
      const user = await this.userApiService.login(credentials);
      return user;
    } catch {
      throw new Error(
        $localize`Invalid email or password. Double-check your credentials and try again.`,
      );
    }
  }

  public async logout(user: LocalStorageUser | null): Promise<void> {
    if (!user?.username) {
      return;
    }

    await this.userApiService.logout();
  }

  public isUserExpired(user: LocalStorageUser | null): boolean {
    return !user?.expires || Date.parse(user.expires) < Date.now();
  }

  public handleAuthCallback(nextPageUrl: string): void {
    void this.router.navigate([nextPageUrl]);
  }
}
