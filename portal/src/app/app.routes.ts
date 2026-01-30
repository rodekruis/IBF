import { Routes } from '@angular/router';

import { authGuard } from '~/guards/auth.guard';

export enum AppRoutes {
  authCallback = 'auth-callback',
  home = 'home',
  login = 'login',
}
export const routes: Routes = [
  {
    path: AppRoutes.login,
    title: $localize`:@@page-title-login:Log in`,
    loadComponent: () =>
      import('~/pages/login/login.page').then((x) => x.LoginPageComponent),
  },
  {
    path: AppRoutes.authCallback,
    title: $localize`:@@generic-loading:Loading...`,
    loadComponent: () =>
      import('~/pages/auth-callback/auth-callback.page').then(
        (x) => x.AuthCallbackPageComponent,
      ),
  },
  {
    path: AppRoutes.home,
    title: $localize`:@@page-title-home:Home`,
    loadComponent: () =>
      import('~/pages/home/home.page').then((x) => x.HomePageComponent),
    canActivate: [authGuard],
  },
  { path: '', redirectTo: AppRoutes.home, pathMatch: 'full' },
  {
    path: '**',
    redirectTo: AppRoutes.home,
  },
];
