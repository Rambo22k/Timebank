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
import { ExchangeService } from '../../../core/services/exchange.service';

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

  proposedMessage = '¡Hola! Me encantaría coordinar una sesión de 1 hora para aprender de tu experiencia y compartir aprendizajes.';
  requestedHours = 1;
  proposedStartAt = this.defaultStartAt();
  readonly durationOptions = [0.25, 0.5, 0.75, 1, 1.5, 2];
  isSubmitting = false;
  proposalError = '';

  constructor(
    public authService: AuthService,
    private exchangeService: ExchangeService
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

  onSendProposal(): void {
    if (!this.skill) return;
    const currentUser = this.authService.currentUser();
    const startAt = new Date(this.proposedStartAt);
    if (!currentUser) { this.proposalError = 'Inicia sesión antes de enviar una solicitud.'; return; }
    if (this.skill.type !== 'offered') { this.proposalError = 'Solo puedes solicitar una habilidad que otra persona ofrece.'; return; }
    if (this.skill.userId === currentUser.id) { this.proposalError = 'No puedes solicitar una habilidad de tu propio perfil.'; return; }
    if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) { this.proposalError = 'Elige una fecha futura para la sesión.'; return; }
    if (this.requestedHours <= 0 || this.requestedHours * 4 !== Math.round(this.requestedHours * 4)) { this.proposalError = 'La duración debe usar incrementos de 15 minutos.'; return; }
    if (currentUser.timeCredits < this.requestedHours) { this.proposalError = 'No tienes créditos suficientes para esta duración.'; return; }
    this.proposalError = '';
    this.isSubmitting = true;
    this.exchangeService.createRequest({
      providerId: this.skill.userId,
      providerName: this.skill.authorName,
      providerAvatar: this.skill.authorAvatar,
      skillId: this.skill.id,
      skillTitle: this.skill.title,
      message: this.proposedMessage.trim(),
      proposedStartAt: startAt.toISOString(),
      requestedHours: this.requestedHours
    });
    this.isSubmitting = false;
    this.close.emit();
  }

  private defaultStartAt(): string {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(12, 0, 0, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  }

  onClose(): void {
    this.close.emit();
  }
}
