import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { shieldCheckmarkOutline, timeOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

function adultValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const birthDate = new Date(`${control.value}T00:00:00`);
  const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setFullYear(cutoff.getFullYear() - 18);
  return !Number.isNaN(birthDate.getTime()) && birthDate <= cutoff ? null : { minimumAge: true };
}

@Component({
  selector: 'app-auth-complete-profile', standalone: true,
  imports: [
    TranslatePipe,CommonModule, ReactiveFormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent],
  templateUrl: './complete-profile.page.html', styleUrls: ['./register/register.page.scss']
})
export class CompleteProfilePage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  isSaving = false;
  readonly maxBirthDate = this.latestAdultBirthDate();
  form: FormGroup;

  constructor() {
    addIcons({ shieldCheckmarkOutline, timeOutline });
    this.form = this.fb.group({
      birthDate: ['', [Validators.required, adultValidator]],
      agreeTerms: [false, Validators.requiredTrue],
      agreePrivacy: [false, Validators.requiredTrue]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving = true;
    try {
      await this.auth.completeOnboarding(this.form.controls['birthDate'].value!);
      await this.router.navigate(['/profile']);
    } catch (error) {
      this.toast.danger(error instanceof Error ? error.message : 'No se pudo guardar la información.');
    } finally { this.isSaving = false; }
  }

  private latestAdultBirthDate(): string {
    const date = new Date(); date.setFullYear(date.getFullYear() - 18);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
