import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AppRoutes } from '~/app.routes';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  AppRoutes = AppRoutes;
  currentYear: number = new Date().getFullYear();
}
