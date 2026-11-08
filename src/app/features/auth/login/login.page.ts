import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  logInOutline,
  sparklesOutline,
  shieldCheckmarkOutline,
  timeOutline,
} from 'ionicons/icons';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../../shared/components/footer/footer.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    TranslatePipe,
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    IonIcon,
    NavbarComponent,
    FooterComponent
  ],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  form: FormGroup;
  showPassword = false;
  isLoading = false;
  isGoogleLoading = false;
  isResendingConfirmation = false;
  emailConfirmationNotice = '';

  constructor() {
    addIcons({
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      logInOutline,
      sparklesOutline,
      shieldCheckmarkOutline,
      timeOutline
    });

    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
    this.emailConfirmationNotice = this.route.snapshot.queryParamMap.get('emailConfirmation') ?? '';
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.warning('Por favor completa todos los campos requeridos.');
      return;
    }

    this.isLoading = true;
    const { email, password } = this.form.value;

    try {
      await this.authService.login(email, password);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const destination = this.authService.needsProfileCompletion()
        ? '/auth/complete-profile'
        : returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/profile';
      await this.router.navigateByUrl(destination);
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo iniciar sesión.');
    } finally {
      this.isLoading = false;
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.isGoogleLoading = true;
    try {
      await this.authService.signInWithGoogle();
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo iniciar con Google.');
      this.isGoogleLoading = false;
    }
  }

  async resendConfirmation(): Promise<void> {
    if (!this.emailConfirmationNotice) return;
    this.isResendingConfirmation = true;
    try {
      await this.authService.resendSignupConfirmation(this.emailConfirmationNotice);
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo reenviar el correo.');
    } finally {
      this.isResendingConfirmation = false;
    }
  }
}
