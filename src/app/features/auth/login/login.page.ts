import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
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
  personOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../../shared/components/footer/footer.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { MOCK_USERS } from '../../../core/mock-data/users.mock';

@Component({
  selector: 'app-login',
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
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {
  form: FormGroup;
  showPassword = false;
  isLoading = false;
  demoUsers = MOCK_USERS;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router
  ) {
    addIcons({
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      logInOutline,
      sparklesOutline,
      shieldCheckmarkOutline,
      timeOutline,
      personOutline
    });

    this.form = this.fb.group({
      email: ['enyel@timebank.app', [Validators.required, Validators.email]],
      password: ['12345678', [Validators.required, Validators.minLength(6)]],
      rememberMe: [true]
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  quickLoginAs(email: string): void {
    this.form.patchValue({ email, password: 'password123' });
    this.onSubmit();
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
      const success = await this.authService.login(email, password);
      if (success) {
        this.router.navigate(['/profile']);
      }
    } finally {
      this.isLoading = false;
    }
  }
}
