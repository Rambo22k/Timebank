import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline, sparklesOutline, swapHorizontalOutline } from 'ionicons/icons';
import { Skill, SkillType, SkillLevel, SkillModality } from '../../../core/models/skill.model';
import { SkillCategory } from '../../../core/models/category.model';
import { AuthService } from '../../../core/services/auth.service';
import { SkillsService } from '../../../core/services/skills.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-skill-form-modal',
  standalone: true,
  imports: [
    TranslatePipe,CommonModule, FormsModule, ReactiveFormsModule, IonIcon],
  templateUrl: './skill-form-modal.component.html',
  styleUrls: ['./skill-form-modal.component.scss']
})
export class SkillFormModalComponent implements OnChanges {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private skillsService = inject(SkillsService);

  @Input() isOpen = false;
  @Input() skillToEdit: Skill | null = null;
  @Input() defaultType: SkillType = 'offered';
  @Input() isSubmitting = false;

  @Output() closed = new EventEmitter<void>();
  @Output() save = new EventEmitter<Omit<Skill, 'id' | 'createdAt'>>();

  form: FormGroup;
  get categories(): SkillCategory[] { return this.skillsService.categories(); }

  levels: SkillLevel[] = ['Cualquiera', 'Principiante', 'Intermedio', 'Avanzado', 'Experto'];
  modalities: SkillModality[] = ['Online', 'Presencial', 'Híbrido'];

  constructor() {
    addIcons({ closeOutline, checkmarkOutline, sparklesOutline, swapHorizontalOutline });

    this.form = this.fb.group({
      type: ['offered', Validators.required],
      title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(90)]],
      categoryId: [this.categories[0]?.id ?? '', Validators.required],
      level: ['Intermedio', Validators.required],
      modality: ['Online', Validators.required],
      availability: ['2 horas / semana', [Validators.required, Validators.maxLength(50)]],
      description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(500)]],
      tagsInput: ['']
    });

    effect(() => {
      const firstCategoryId = this.skillsService.categories()[0]?.id;
      if (firstCategoryId && !this.form.get('categoryId')?.value) {
        this.form.patchValue({ categoryId: firstCategoryId }, { emitEvent: false });
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      if (this.skillToEdit) {
        this.form.patchValue({
          type: this.skillToEdit.type,
          title: this.skillToEdit.title,
          categoryId: this.skillToEdit.categoryId,
          level: this.skillToEdit.level,
          modality: this.skillToEdit.modality,
          availability: this.skillToEdit.availability,
          description: this.skillToEdit.description,
          tagsInput: this.skillToEdit.tags?.join(', ') || ''
        });
      } else {
        this.form.reset({
          type: this.defaultType,
          title: '',
          categoryId: this.categories[0]?.id ?? '',
          level: 'Intermedio',
          modality: 'Online',
          availability: '2 horas / semana',
          description: '',
          tagsInput: ''
        });
      }
    }
  }

  setType(type: SkillType): void {
    this.form.patchValue({ type });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formVal = this.form.value;
    const selectedCat = this.categories.find(category => category.id === formVal.categoryId);
    const currentUser = this.authService.currentUser();
    if (!currentUser || !selectedCat) return;
    const tags = formVal.tagsInput
      ? formVal.tagsInput.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
      : [];

    this.save.emit({
        userId: currentUser.id,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar,
        authorHeadline: currentUser.headline,
        authorLocation: currentUser.location,
        authorRating: currentUser.rating,
        type: formVal.type,
        title: formVal.title.trim(),
        categoryId: selectedCat.id,
        categoryName: selectedCat.name,
        description: formVal.description.trim(),
        level: formVal.level,
        modality: formVal.modality,
        hoursValue: 1, // Standard TimeBank rule: 1h = 1 crédito
        tags,
        location: formVal.modality === 'Online' ? 'Remoto' : 'Presencial',
        availability: formVal.availability.trim()
      });
  }

  onClose(): void {
    this.closed.emit();
  }
}
