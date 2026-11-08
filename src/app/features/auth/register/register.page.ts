import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  personOutline,
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  sparklesOutline,
  checkmarkCircleOutline,
  shieldCheckmarkOutline,
  timeOutline,
  giftOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../../shared/components/footer/footer.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { COUNTRY_OPTIONS } from '../../../core/data/localization-options';

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  if (password && confirmPassword && password !== confirmPassword) {
    return { passwordMismatch: true };
  }
  return null;
}

function adultValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const birthDate = new Date(`${control.value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return { invalidDate: true };
  const latestAllowedDate = new Date();
  latestAllowedDate.setHours(0, 0, 0, 0);
  latestAllowedDate.setFullYear(latestAllowedDate.getFullYear() - 18);
  return birthDate <= latestAllowedDate ? null : { minimumAge: 18 };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    IonIcon,
    NavbarComponent,
    FooterComponent
  ],
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss']
})
export class RegisterPage {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  form: FormGroup;
  showPassword = false;
  showConfirmPassword = false;
  isLoading = false;
  isGoogleLoading = false;
  readonly maxBirthDate = this.latestAdultBirthDate();
  readonly countries = COUNTRY_OPTIONS;

  constructor() {
    addIcons({
      personOutline,
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      sparklesOutline,
      checkmarkCircleOutline,
      shieldCheckmarkOutline,
      timeOutline,
      giftOutline
    });

    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      countryCode: ['DO', [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]],
      birthDate: ['', [Validators.required, adultValidator]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      agreeTerms: [false, [Validators.requiredTrue]],
      agreePrivacy: [false, [Validators.requiredTrue]]
    }, { validators: passwordMatchValidator });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.warning('Por favor revisa los errores en el formulario de registro.');
      return;
    }

    this.isLoading = true;
    const { name, email, password, birthDate, countryCode } = this.form.getRawValue();

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const result = await this.authService.register({ name, email, password, birthDate, countryCode, timezone });
      if (result.emailConfirmationRequired) {
        await this.router.navigate(['/auth/login'], { queryParams: { emailConfirmation: email.trim() } });
      } else if (this.authService.needsProfileCompletion()) {
        await this.router.navigate(['/auth/complete-profile']);
      } else {
        await this.router.navigate(['/profile']);
      }
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo crear la cuenta.');
    } finally {
      this.isLoading = false;
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.isGoogleLoading = true;
    try {
      await this.authService.signInWithGoogle();
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo continuar con Google.');
      this.isGoogleLoading = false;
    }
  }

  private latestAdultBirthDate(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
