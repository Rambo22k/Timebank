import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline, cameraOutline, timeOutline } from 'ionicons/icons';
import { UserProfile } from '../../../core/models/user.model';
import { countryOptionsFor, languageOptionsFor } from '../../../core/data/localization-options';
import { LocalizationService } from '../../../core/services/localization.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

export interface ProfileEditSubmission {
  updates: Partial<UserProfile>;
  avatarFile: File | null;
}

function timeZoneValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: control.value }).format();
    return null;
  } catch {
    return { invalidTimeZone: true };
  }
}

@Component({
  selector: 'app-edit-profile-modal',
  standalone: true,
  imports: [
    TranslatePipe,CommonModule, FormsModule, ReactiveFormsModule, IonIcon],
  templateUrl: './edit-profile-modal.component.html',
  styleUrls: ['./edit-profile-modal.component.scss']
})
export class EditProfileModalComponent implements OnChanges, OnDestroy {
  private fb = inject(FormBuilder);
  private localization = inject(LocalizationService);

  @Input() isOpen = false;
  @Input() user: UserProfile | null = null;
  @Input() isSaving = false;

  @Output() closed = new EventEmitter<void>();
  @Output() save = new EventEmitter<ProfileEditSubmission>();

  form: FormGroup;
  selectedAvatar = '';
  selectedAvatarFile: File | null = null;
  fileError = '';
  private avatarPreviewUrl: string | null = null;
  get countries() { return countryOptionsFor(this.localization.language()); }
  get languages() { return languageOptionsFor(this.localization.language()); }

  avatarOptions = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80'
  ];

  constructor() {
    addIcons({ closeOutline, checkmarkOutline, cameraOutline, timeOutline });

    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      headline: ['', [Validators.required, Validators.maxLength(100)]],
      location: ['', [Validators.required, Validators.maxLength(120)]],
      countryCode: ['', [Validators.required, Validators.pattern(/^[A-Z]{2}$/)]],
      timezone: ['', [Validators.required, Validators.maxLength(100), timeZoneValidator]],
      preferredLanguage: ['es', [Validators.required]],
      languages: [[] as string[]],
      bio: ['', [Validators.maxLength(400)]]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen && this.user) {
      this.selectedAvatar = this.user.avatar;
      this.clearAvatarFile();
      this.form.patchValue({
        name: this.user.name,
        headline: this.user.headline,
        location: this.user.location,
        countryCode: this.user.countryCode,
        timezone: this.user.timezone,
        preferredLanguage: this.user.preferredLanguage,
        languages: this.user.languages,
        bio: this.user.bio
      });
    }
  }

  toggleLanguage(languageCode: string, checked: boolean): void {
    const selected = new Set(this.form.get('languages')?.value as string[] ?? []);
    if (checked && selected.size < 12) selected.add(languageCode); else if (!checked) selected.delete(languageCode);
    this.form.get('languages')?.setValue([...selected]);
  }

  selectAvatar(url: string): void {
    this.clearAvatarFile();
    this.selectedAvatar = url;
  }

  onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.fileError = '';
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.fileError = 'Elige una imagen JPG, PNG o WebP.';
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.fileError = 'La imagen no puede superar los 5 MB.';
      input.value = '';
      return;
    }

    this.clearAvatarFile();
    this.selectedAvatarFile = file;
    this.avatarPreviewUrl = URL.createObjectURL(file);
    this.selectedAvatar = this.avatarPreviewUrl;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.save.emit({
      updates: {
        name: this.form.value.name.trim(),
        headline: this.form.value.headline.trim(),
        location: this.form.value.location.trim(),
        countryCode: this.form.value.countryCode,
        timezone: this.form.value.timezone.trim(),
        preferredLanguage: this.form.value.preferredLanguage,
        languages: this.form.value.languages,
        bio: this.form.value.bio.trim(),
        avatar: this.selectedAvatar
      },
      avatarFile: this.selectedAvatarFile
    });
  }

  onClose(): void {
    this.clearAvatarFile();
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.clearAvatarFile();
  }

  private clearAvatarFile(): void {
    if (this.avatarPreviewUrl) URL.revokeObjectURL(this.avatarPreviewUrl);
    this.avatarPreviewUrl = null;
    this.selectedAvatarFile = null;
    this.fileError = '';
  }
}
