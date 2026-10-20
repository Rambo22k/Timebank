import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline, cameraOutline } from 'ionicons/icons';
import { UserProfile } from '../../../core/models/user.model';

@Component({
  selector: 'app-edit-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonIcon],
  templateUrl: './edit-profile-modal.component.html',
  styleUrls: ['./edit-profile-modal.component.scss']
})
export class EditProfileModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() user: UserProfile | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Partial<UserProfile>>();

  form: FormGroup;
  selectedAvatar = '';

  avatarOptions = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80'
  ];

  constructor(private fb: FormBuilder) {
    addIcons({ closeOutline, checkmarkOutline, cameraOutline });

    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      headline: ['', [Validators.required, Validators.maxLength(100)]],
      location: ['', [Validators.required]],
      bio: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(400)]]
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen && this.user) {
      this.selectedAvatar = this.user.avatar;
      this.form.patchValue({
        name: this.user.name,
        headline: this.user.headline,
        location: this.user.location,
        bio: this.user.bio
      });
    }
  }

  selectAvatar(url: string): void {
    this.selectedAvatar = url;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.save.emit({
      name: this.form.value.name.trim(),
      headline: this.form.value.headline.trim(),
      location: this.form.value.location.trim(),
      bio: this.form.value.bio.trim(),
      avatar: this.selectedAvatar
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
