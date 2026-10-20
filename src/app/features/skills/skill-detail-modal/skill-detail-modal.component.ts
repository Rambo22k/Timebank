import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  personOutline
} from 'ionicons/icons';
import { Skill } from '../../../core/models/skill.model';

@Component({
  selector: 'app-skill-detail-modal',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './skill-detail-modal.component.html',
  styleUrls: ['./skill-detail-modal.component.scss']
})
export class SkillDetailModalComponent {
  @Input() isOpen = false;
  @Input() skill: Skill | null = null;
  @Input() isOwner = false;

  @Output() close = new EventEmitter<void>();
  @Output() exchange = new EventEmitter<Skill>();
  @Output() edit = new EventEmitter<Skill>();

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
      personOutline
    });
  }

  onClose(): void {
    this.close.emit();
  }

  onExchange(): void {
    if (this.skill) {
      this.exchange.emit(this.skill);
    }
  }

  onEdit(): void {
    if (this.skill) {
      this.edit.emit(this.skill);
    }
  }
}
