import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  timeOutline,
  star,
  locationOutline,
  createOutline,
  trashOutline,
  arrowForwardOutline,
  swapHorizontalOutline,
  sparklesOutline
} from 'ionicons/icons';
import { Skill } from '../../../core/models/skill.model';

@Component({
  selector: 'app-skill-card',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './skill-card.component.html',
  styleUrls: ['./skill-card.component.scss']
})
export class SkillCardComponent {
  @Input({ required: true }) skill!: Skill;
  @Input() isOwner = false;
  @Input() compact = false;

  @Output() viewDetail = new EventEmitter<Skill>();
  @Output() exchange = new EventEmitter<Skill>();
  @Output() edit = new EventEmitter<Skill>();
  @Output() delete = new EventEmitter<Skill>();

  constructor() {
    addIcons({
      timeOutline,
      star,
      locationOutline,
      createOutline,
      trashOutline,
      arrowForwardOutline,
      swapHorizontalOutline,
      sparklesOutline
    });
  }

  onViewDetail(e: Event): void {
    e.stopPropagation();
    this.viewDetail.emit(this.skill);
  }

  onExchange(e: Event): void {
    e.stopPropagation();
    this.exchange.emit(this.skill);
  }

  onEdit(e: Event): void {
    e.stopPropagation();
    this.edit.emit(this.skill);
  }

  onDelete(e: Event): void {
    e.stopPropagation();
    this.delete.emit(this.skill);
  }
}
