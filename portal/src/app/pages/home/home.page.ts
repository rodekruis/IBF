import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

import { PageLayoutComponent } from '~/components/page-layout/page-layout.component';
import { RtlHelperService } from '~/services/rtl-helper.service';
import { ToastService } from '~/services/toast.service';

@Component({
  selector: 'app-home',
  imports: [PageLayoutComponent, ButtonModule, CardModule],
  providers: [ToastService],
  templateUrl: './home.page.html',
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  readonly rtlHelper = inject(RtlHelperService);
}
