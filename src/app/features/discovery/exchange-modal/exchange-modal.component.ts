import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
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
import { SkillsService } from '../../../core/services/skills.service';

@Component({
  selector: 'app-exchange-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon],
  templateUrl: './exchange-modal.component.html',
  styleUrls: ['./exchange-modal.component.scss']
})
export class ExchangeModalComponent implements OnChanges {
  authService = inject(AuthService);
  private exchangeService = inject(ExchangeService);
  private skillsService = inject(SkillsService);

  @Input() isOpen = false;
  @Input() skill: Skill | null = null;

  @Output() closed = new EventEmitter<void>();

  proposedMessage = '¡Hola! Me encantaría coordinar una sesión de 1 hora para aprender de tu experiencia y compartir aprendizajes.';
  requestedHours = 1;
  proposedStartAt = this.defaultStartAt();
  readonly durationOptions = [0.25, 0.5, 0.75, 1, 1.5, 2];
  isSubmitting = false;
  proposalError = '';
  selectedTeachingSkillId = '';

  get teachingSkills(): Skill[] {
    const userId = this.authService.authUser()?.id;
    if (!userId || !this.skill || this.skill.type !== 'wanted') return [];
    return this.skillsService.getOfferedSkillsByUser(userId)
      .filter(item => item.status === 'active' && item.categoryId === this.skill?.categoryId);
  }

  constructor() {
    addIcons({
      closeOutline,
      timeOutline,
      swapHorizontalOutline,
      informationCircleOutline,
      checkmarkCircleOutline,
      shieldCheckmarkOutline
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['skill'] || !this.skill) return;
    this.proposalError = '';
    this.selectedTeachingSkillId = '';
    this.requestedHours = 1;
    this.proposedStartAt = this.defaultStartAt();
    this.proposedMessage = this.skill.type === 'wanted'
      ? 'Vi que quieres aprender esta habilidad. Puedo compartir mi experiencia contigo.'
      : '¡Hola! Me encantaría coordinar una sesión para aprender de tu experiencia.';
  }

  async onSendProposal(): Promise<void> {
    if (!this.skill || this.isSubmitting) return;
    const currentUser = this.authService.currentUser();
    const startAt = new Date(this.proposedStartAt);
    if (!currentUser) { this.proposalError = 'Inicia sesión antes de enviar una propuesta.'; return; }
    if (this.skill.userId === currentUser.id) { this.proposalError = 'No puedes proponer un intercambio contigo mismo.'; return; }
    if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) { this.proposalError = 'Elige una fecha futura para la sesión.'; return; }
    if (this.requestedHours <= 0 || this.requestedHours * 4 !== Math.round(this.requestedHours * 4)) { this.proposalError = 'La duración debe usar incrementos de 15 minutos.'; return; }
    if (this.skill.type === 'offered' && currentUser.timeCredits < this.requestedHours) { this.proposalError = 'No tienes créditos suficientes para esta duración.'; return; }

    this.proposalError = '';
    this.isSubmitting = true;
    try {
      let created: boolean;
      if (this.skill.type === 'offered') {
        created = await this.exchangeService.createRequest({
          providerId: this.skill.userId,
          providerName: this.skill.authorName,
          providerAvatar: this.skill.authorAvatar,
          skillId: this.skill.id,
          skillTitle: this.skill.title,
          message: this.proposedMessage.trim(),
          proposedStartAt: startAt.toISOString(),
          requestedHours: this.requestedHours
        });
      } else {
        const offeredSkill = this.teachingSkills.find(item => item.id === this.selectedTeachingSkillId);
        if (!offeredSkill) {
          this.proposalError = 'Publica una habilidad ofrecida en esta categoría antes de enviar la oferta.';
          return;
        }
        created = await this.exchangeService.createTeachingOffer({
          recipientId: this.skill.userId,
          wantedSkillId: this.skill.id,
          providerSkillId: offeredSkill.id,
          message: `Oferta para aprender “${this.skill.title}”. Enseñaría “${offeredSkill.title}”.\n\n${this.proposedMessage.trim()}`,
          proposedStartAt: startAt.toISOString(),
          requestedHours: this.requestedHours
        });
      }
      if (created) this.closed.emit();
      else this.proposalError = 'No se pudo enviar la solicitud. Revisa los datos e inténtalo de nuevo.';
    } finally {
      this.isSubmitting = false;
    }
  }

  private defaultStartAt(): string {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(12, 0, 0, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  }

  onClose(): void {
    this.closed.emit();
  }
}
