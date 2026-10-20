import { Component } from '@angular/core';
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
  form: FormGroup;
  isSubmitting = false;
  isSent = false;
  submittedEmail = '';

  constructor(
    private fb: FormBuilder,
    private toastService: ToastService
  ) {
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

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.submittedEmail = this.form.value.email;

    setTimeout(() => {
      this.isSubmitting = false;
      this.isSent = true;
      this.toastService.info('Enlace de recuperación simulado enviado.');
    }, 500);
  }

  resetForm(): void {
    this.isSent = false;
    this.form.reset();
  }
}
