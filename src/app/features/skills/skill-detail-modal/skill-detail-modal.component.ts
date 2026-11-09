import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  timeOutline,
  star,
  locationOutline,
  sparklesOutline,
  swapHorizontalOutline,
  calendarOutline,
  ribbonOutline,
  personOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';
import { Skill } from '../../../core/models/skill.model';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';

@Component({
  selector: 'app-skill-detail-modal',
  standalone: true,
  imports: [
    TranslatePipe,CommonModule, FormsModule, RouterModule, IonIcon],
  templateUrl: './skill-detail-modal.component.html',
  styleUrls: ['./skill-detail-modal.component.scss']
})
export class SkillDetailModalComponent {
  readonly auth = inject(AuthService);
  private chat = inject(ChatService);
  @Input() isOpen = false;
  @Input() skill: Skill | null = null;
  @Input() isOwner = false;

  @Output() closed = new EventEmitter<void>();
  @Output() exchange = new EventEmitter<Skill>();
  @Output() edit = new EventEmitter<Skill>();
  reportOpen = false;
  reportReason = '';
  isSubmittingReport = false;

  get canReportSkill(): boolean {
    const userId = this.auth.authUser()?.id;
    return !!userId && !!this.skill && this.skill.userId !== userId;
  }

  constructor() {
    addIcons({
      closeOutline,
      timeOutline,
      star,
      locationOutline,
      sparklesOutline,
      swapHorizontalOutline,
      calendarOutline,
      ribbonOutline,
      personOutline,
      checkmarkCircleOutline
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onExchange(): void {
    if (this.skill) {
      const skill = this.skill;
      this.closed.emit();
      this.exchange.emit(skill);
    }
  }

  onEdit(): void {
    if (this.skill) {
      this.edit.emit(this.skill);
    }
  }

  async submitReport(): Promise<void> {
    if (!this.skill || !this.auth.authUser() || this.isSubmittingReport) return;
    this.isSubmittingReport = true;
    try {
      if (await this.chat.reportSkill(this.skill.id, this.reportReason)) {
        this.reportReason = '';
        this.reportOpen = false;
      }
    } finally {
      this.isSubmittingReport = false;
    }
  }
}
