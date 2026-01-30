import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';

import { FooterComponent } from '~/components/page-layout/components/footer/footer.component';
import { HeaderComponent } from '~/components/page-layout/components/header/header.component';
import { RtlHelperService } from '~/services/rtl-helper.service';

@Component({
  selector: 'app-page-layout',
  imports: [
    HeaderComponent,
    FooterComponent,
    CardModule,
    MessageModule,
    SkeletonModule,
    RouterLink,
  ],
  templateUrl: './page-layout.component.html',
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageLayoutComponent {
  readonly rtlHelper = inject(RtlHelperService);
  readonly route = inject(ActivatedRoute);

  readonly pageTitle = input<string>();
  readonly parentPageTitle = input<string>();
  readonly parentPageLink = input<RouterLink['routerLink']>();

  readonly programId = input<string>();

  readonly isPending = input<boolean>();
}
