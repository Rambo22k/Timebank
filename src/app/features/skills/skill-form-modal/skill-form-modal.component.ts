import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline, sparklesOutline, swapHorizontalOutline } from 'ionicons/icons';
import { Skill, SkillType, SkillLevel, SkillModality } from '../../../core/models/skill.model';
import { SkillCategory } from '../../../core/models/category.model';
import { MOCK_CATEGORIES } from '../../../core/mock-data/categories.mock';

@Component({
  selector: 'app-skill-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonIcon],
  templateUrl: './skill-form-modal.component.html',
  styleUrls: ['./skill-form-modal.component.scss']
})
export class SkillFormModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() skillToEdit: Skill | null = null;
  @Input() defaultType: SkillType = 'offered';

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Omit<Skill, 'id' | 'createdAt'>>();

  form: FormGroup;
  categories: SkillCategory[] = MOCK_CATEGORIES;
  isSubmitting = false;

  levels: SkillLevel[] = ['Principiante', 'Intermedio', 'Avanzado', 'Experto'];
  modalities: SkillModality[] = ['Online', 'Presencial', 'Híbrido'];

  constructor(private fb: FormBuilder) {
    addIcons({ closeOutline, checkmarkOutline, sparklesOutline, swapHorizontalOutline });

    this.form = this.fb.group({
      type: ['offered', Validators.required],
      title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(90)]],
      categoryId: [this.categories[0].id, Validators.required],
      level: ['Intermedio', Validators.required],
      modality: ['Online', Validators.required],
      availability: ['2 horas / semana', [Validators.required, Validators.maxLength(50)]],
      description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(500)]],
      tagsInput: ['']
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
          categoryId: this.categories[0].id,
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

    this.isSubmitting = true;

    // Simulate instant client submit
    setTimeout(() => {
      const formVal = this.form.value;
      const selectedCat = this.categories.find(c => c.id === formVal.categoryId) || this.categories[0];
      const tags = formVal.tagsInput
        ? formVal.tagsInput.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0)
        : [];

      this.save.emit({
        userId: this.skillToEdit ? this.skillToEdit.userId : 'user-enyel',
        authorName: this.skillToEdit ? this.skillToEdit.authorName : 'Enyel Reyes',
        authorAvatar: this.skillToEdit ? this.skillToEdit.authorAvatar : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
        authorHeadline: this.skillToEdit ? this.skillToEdit.authorHeadline : 'Senior Frontend Developer & UI Designer',
        authorLocation: 'Santo Domingo, Rep. Dom.',
        authorRating: 4.9,
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

      this.isSubmitting = false;
    }, 300);
  }

  onClose(): void {
    this.close.emit();
  }
}
