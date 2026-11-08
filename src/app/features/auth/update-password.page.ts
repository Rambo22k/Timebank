import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, lockClosedOutline, timeOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';

function passwordMatch(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-auth-update-password', standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent],
  templateUrl: './update-password.page.html', styleUrls: ['./register/register.page.scss']
})
export class UpdatePasswordPage implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  isReady = false;
  isSaving = false;
  form: FormGroup;
  constructor() {
    addIcons({ checkmarkCircleOutline, lockClosedOutline, timeOutline });
    this.form = this.fb.group({ password: ['', [Validators.required, Validators.minLength(8)]], confirmPassword: ['', Validators.required] }, { validators: passwordMatch });
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.auth.ensureInitialized();
      if (!this.auth.isAuthenticated()) {
        this.toast.warning('El enlace de recuperación venció o ya fue utilizado. Solicita uno nuevo.');
        await this.router.navigate(['/auth/forgot-password']);
        return;
      }
      this.isReady = true;
    } catch {
      await this.router.navigate(['/auth/forgot-password']);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving = true;
    try {
      await this.auth.updatePassword(this.form.controls['password'].value!);
      await this.router.navigate(['/profile']);
    } catch (error) {
      this.toast.danger(error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.');
    } finally { this.isSaving = false; }
  }
}
