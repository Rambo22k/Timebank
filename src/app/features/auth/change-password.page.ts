import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, lockClosedOutline, timeOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

function passwordMatch(control: AbstractControl): ValidationErrors | null {
  return control.get('newPassword')?.value === control.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };
}

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent],
  templateUrl: './change-password.page.html',
  styleUrls: ['./register/register.page.scss']
})
export class ChangePasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  isSaving = false;
  showCurrentPassword = false;
  form: FormGroup = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  }, { validators: passwordMatch });

  constructor() {
    addIcons({ checkmarkCircleOutline, lockClosedOutline, timeOutline });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.isSaving) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    try {
      await this.auth.changePassword(
        this.form.controls['currentPassword'].value,
        this.form.controls['newPassword'].value
      );
      await this.router.navigate(['/profile']);
    } catch (error) {
      this.toast.danger(error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.');
    } finally {
      this.isSaving = false;
    }
  }
}
