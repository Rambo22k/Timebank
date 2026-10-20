import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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
  layersOutline
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, IonIcon],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  mobileMenuOpen = signal(false);

  constructor(public authService: AuthService) {
    addIcons({
      menuOutline,
      closeOutline,
      timeOutline,
      personCircleOutline,
      logOutOutline,
      sparklesOutline,
      searchOutline,
      layersOutline
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  onLogout(): void {
    this.authService.logout();
    this.closeMobileMenu();
  }
}
