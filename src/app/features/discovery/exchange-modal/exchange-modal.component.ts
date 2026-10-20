import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  timeOutline,
  swapHorizontalOutline,
  informationCircleOutline,
  checkmarkCircleOutline,
  shieldCheckmarkOutline
} from 'ionicons/icons';
import { Skill } from '../../../core/models/skill.model';
import { AuthService } from '../../../core/services/auth.service';
import { SkillsService } from '../../../core/services/skills.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-exchange-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './exchange-modal.component.html',
  styleUrls: ['./exchange-modal.component.scss']
})
export class ExchangeModalComponent {
  @Input() isOpen = false;
  @Input() skill: Skill | null = null;

  @Output() close = new EventEmitter<void>();

  exchangeType: 'credit' | 'skill' = 'credit';
  selectedReturnSkillId = '';
  proposedMessage = '¡Hola! Me encantaría coordinar una sesión de 1 hora para aprender de tu experiencia y compartir aprendizajes.';
  isSubmitting = false;

  constructor(
    public authService: AuthService,
    public skillsService: SkillsService,
    private toastService: ToastService
  ) {
    addIcons({
      closeOutline,
      timeOutline,
      swapHorizontalOutline,
      informationCircleOutline,
      checkmarkCircleOutline,
      shieldCheckmarkOutline
    });
  }

  get currentUserOfferedSkills(): Skill[] {
    const user = this.authService.currentUser();
    return user ? this.skillsService.getOfferedSkillsByUser(user.id) : [];
  }

  onSendProposal(): void {
    if (!this.skill) return;

    this.isSubmitting = true;

    setTimeout(() => {
      this.toastService.success(
        `¡Propuesta de intercambio enviada a ${this.skill?.authorName}! (Simulación frontend)`
      );
      this.isSubmitting = false;
      this.close.emit();
    }, 400);
  }

  onClose(): void {
    this.close.emit();
  }
}
