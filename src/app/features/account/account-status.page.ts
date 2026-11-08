import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { alertCircleOutline, logOutOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-account-status',
  standalone: true,
  imports: [CommonModule, IonIcon, TranslatePipe],
  templateUrl: './account-status.page.html',
  styleUrls: ['./account-status.page.scss']
})
export class AccountStatusPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  constructor() {
    addIcons({ alertCircleOutline, logOutOutline });
  }

  async signOut(): Promise<void> {
    try {
      await this.auth.logout();
      await this.router.navigate(['/auth/login']);
    } catch (error) {
      this.toast.danger(error instanceof Error ? error.message : 'No se pudo cerrar sesión.');
    }
  }
}
