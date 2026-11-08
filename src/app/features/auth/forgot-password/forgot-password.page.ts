import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  arrowBackOutline,
  checkmarkCircleOutline,
  paperPlaneOutline,
  keyOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../../shared/components/footer/footer.component';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
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
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss']
})
export class ForgotPasswordPage {
  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  form: FormGroup;
  isSubmitting = false;
  isSent = false;
  submittedEmail = '';

  constructor() {
    addIcons({
      mailOutline,
      arrowBackOutline,
      checkmarkCircleOutline,
      paperPlaneOutline,
      keyOutline
    });

    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.submittedEmail = this.form.value.email;
    try {
      await this.authService.requestPasswordReset(this.submittedEmail);
      this.isSent = true;
      this.toastService.info('Si el correo corresponde a una cuenta, recibirás un enlace para cambiar tu contraseña.');
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo solicitar el restablecimiento.');
    } finally {
      this.isSubmitting = false;
    }
  }

  resetForm(): void {
    this.isSent = false;
    this.form.reset();
  }
}
