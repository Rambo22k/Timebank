import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  menuOutline,
  closeOutline,
  timeOutline,
  personCircleOutline,
  logOutOutline,
  sparklesOutline,
  searchOutline,
  layersOutline,
  calendarOutline,
  walletOutline,
  mailOutline,
  starOutline
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, IonIcon],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  mobileMenuOpen = signal(false);

  constructor(public authService: AuthService, private router: Router, private toastService: ToastService) {
    addIcons({
      menuOutline,
      closeOutline,
      timeOutline,
      personCircleOutline,
      logOutOutline,
      sparklesOutline,
      searchOutline,
      layersOutline,
      calendarOutline,
      walletOutline,
      mailOutline,
      starOutline
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  async onLogout(): Promise<void> {
    try {
      await this.authService.logout();
      await this.router.navigate(['/']);
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.');
    } finally {
      this.closeMobileMenu();
    }
  }
}
