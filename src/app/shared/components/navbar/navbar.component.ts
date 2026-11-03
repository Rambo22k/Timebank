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
  starOutline,
  notificationsOutline,
  checkmarkDoneOutline
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { AppNotification } from '../../../core/models/notification.model';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, IonIcon],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  mobileMenuOpen = signal(false);
  notificationPanelOpen = signal(false);

  constructor(
    public authService: AuthService,
    public notifications: NotificationsService,
    private router: Router,
    private toastService: ToastService
  ) {
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
      starOutline,
      notificationsOutline,
      checkmarkDoneOutline
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleNotifications(): void {
    this.notificationPanelOpen.update(open => !open);
    if (this.notificationPanelOpen()) void this.notifications.refresh();
  }

  async openNotification(notification: AppNotification): Promise<void> {
    if (!notification.readAt) await this.notifications.markRead(notification.id);
    this.notificationPanelOpen.set(false);
    this.closeMobileMenu();

    const requestId = notification.data['request_id'];
    const sessionId = notification.data['session_id'];
    const conversationId = notification.data['conversation_id'];
    if (conversationId) {
      await this.router.navigate(['/exchanges/messages'], { queryParams: { conversation: conversationId } });
    } else if (sessionId || notification.type === 'session_completed' || notification.type === 'review_received') {
      await this.router.navigate(['/exchanges/sessions'], { queryParams: sessionId ? { session: sessionId } : undefined });
    } else if (notification.type === 'credit_activity') {
      await this.router.navigate(['/wallet']);
    } else {
      await this.router.navigate(['/exchanges/requests'], { queryParams: requestId ? { request: requestId } : undefined });
    }
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
