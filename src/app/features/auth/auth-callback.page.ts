import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { timeOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-auth-callback', standalone: true, imports: [CommonModule, IonIcon],
  template: `<main class="auth-callback"><div class="callback-card"><ion-icon name="time-outline"></ion-icon><h1>Validando tu acceso</h1><p>Espera un momento mientras confirmamos tu cuenta.</p></div></main>`,
  styles: [`.auth-callback{min-height:100vh;display:grid;place-items:center;background:var(--tb-bg);padding:24px}.callback-card{max-width:420px;padding:40px;background:#fff;text-align:center;border:1px solid var(--tb-border);border-radius:20px;box-shadow:var(--tb-shadow-md)}.callback-card ion-icon{font-size:2rem;color:var(--tb-teal)}.callback-card h1{margin:12px 0 8px;font-size:1.5rem}.callback-card p{margin:0;color:var(--tb-text-secondary)}`]
})
export class AuthCallbackPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  constructor() { addIcons({ timeOutline }); }
  async ngOnInit(): Promise<void> {
    try {
      await this.auth.ensureInitialized();
      if (!this.auth.isAuthenticated()) {
        this.toast.warning('No se pudo completar el acceso. Inténtalo de nuevo o solicita un enlace nuevo.');
        await this.router.navigate(['/auth/login']);
        return;
      }
      await this.auth.reloadAuthenticatedUser();
      await this.router.navigate([this.auth.needsProfileCompletion() ? '/auth/complete-profile' : '/profile']);
    } catch (error) {
      this.toast.danger(error instanceof Error ? error.message : 'No se pudo validar el enlace.');
      await this.router.navigate(['/auth/login']);
    }
  }
}
