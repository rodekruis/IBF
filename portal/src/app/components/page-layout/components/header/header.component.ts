import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { MenuItem } from 'primeng/api';
import { AutoFocusModule } from 'primeng/autofocus';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { FocusTrapModule } from 'primeng/focustrap';
import { MenuModule } from 'primeng/menu';
import { ToolbarModule } from 'primeng/toolbar';

import { AppRoutes } from '~/app.routes';
import { ButtonMenuComponent } from '~/components/button-menu/button-menu.component';
import { LogoComponent } from '~/components/logo/logo.component';
import { HealthWidgetComponent } from '~/components/page-layout/components/health-widget/health-widget.component';
import { AuthService } from '~/services/auth.service';
import { RtlHelperService } from '~/services/rtl-helper.service';
import {
  TrackingAction,
  TrackingCategory,
  TrackingService,
} from '~/services/tracking.service';

@Component({
  selector: 'app-header',
  imports: [
    ButtonModule,
    AutoFocusModule,
    ToolbarModule,
    MenuModule,
    DrawerModule,
    FocusTrapModule,
    FormsModule,
    LogoComponent,
    HealthWidgetComponent,
    ButtonMenuComponent,
    RouterLink,
    RouterLinkActive,
  ],
  providers: [],
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  AppRoutes = AppRoutes;
  private authService = inject(AuthService);
  private trackingService = inject(TrackingService);
  readonly rtlHelper = inject(RtlHelperService);

  readonly programId = input<string>();

  readonly userName = computed(() => this.authService.user?.username);

  readonly userMenuOptions = computed<MenuItem[]>(() => [
    {
      label: $localize`:Menu-item:Logout`,
      icon: 'pi pi-sign-out',
      command: () => {
        this.trackingService.trackEvent({
          category: TrackingCategory.authentication,
          action: TrackingAction.clickLogoutButton,
        });
        void this.authService.logout();
      },
    },
  ]);

  readonly sidebarVisible = model(false);

  readonly sidebarLinks = computed(() => [
    {
      label: $localize`:@@page-title-home:Home`,
      routerLink: `/${AppRoutes.home}`,
    },
  ]);
}
