import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  swapHorizontalOutline,
  layersOutline,
  addOutline,
  createOutline,
  trashOutline,
  timeOutline,
  searchOutline,
  filterOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { SkillCardComponent } from '../../shared/components/skill-card/skill-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SkillFormModalComponent } from './skill-form-modal/skill-form-modal.component';
import { SkillDetailModalComponent } from './skill-detail-modal/skill-detail-modal.component';
import { ConfirmationModalComponent } from '../../shared/components/confirmation-modal/confirmation-modal.component';
import { SkillsService } from '../../core/services/skills.service';
import { AuthService } from '../../core/services/auth.service';
import { Skill, SkillType } from '../../core/models/skill.model';

@Component({
  selector: 'app-skills-management',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonIcon,
    NavbarComponent,
    FooterComponent,
    SkillCardComponent,
    EmptyStateComponent,
    SkillFormModalComponent,
    SkillDetailModalComponent,
    ConfirmationModalComponent
  ],
  templateUrl: './skills-management.page.html',
  styleUrls: ['./skills-management.page.scss']
})
export class SkillsManagementPage {
  selectedFilter = signal<'all' | SkillType>('all');
  searchQuery = signal<string>('');

  // Modals state
  isFormModalOpen = false;
  skillToEdit: Skill | null = null;

  isDetailModalOpen = false;
  selectedSkillForDetail: Skill | null = null;

  isDeleteModalOpen = false;
  skillToDelete: Skill | null = null;

  constructor(
    public skillsService: SkillsService,
    public authService: AuthService
  ) {
    addIcons({
      sparklesOutline,
      swapHorizontalOutline,
      layersOutline,
      addOutline,
      createOutline,
      trashOutline,
      timeOutline,
      searchOutline,
      filterOutline
    });
  }

  get userSkills(): Skill[] {
    const user = this.authService.currentUser();
    if (!user) return [];

    let skills = this.skillsService.getSkillsByUser(user.id);

    const filter = this.selectedFilter();
    if (filter !== 'all') {
      skills = skills.filter(s => s.type === filter);
    }

    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      skills = skills.filter(
        s =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.categoryName.toLowerCase().includes(q)
      );
    }

    return skills;
  }

  get offeredCount(): number {
    const user = this.authService.currentUser();
    return user ? this.skillsService.getOfferedSkillsByUser(user.id).length : 0;
  }

  get wantedCount(): number {
    const user = this.authService.currentUser();
    return user ? this.skillsService.getWantedSkillsByUser(user.id).length : 0;
  }

  setFilter(filter: 'all' | SkillType): void {
    this.selectedFilter.set(filter);
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  openCreateModal(defaultType: SkillType = 'offered'): void {
    this.skillToEdit = null;
    this.isFormModalOpen = true;
  }

  onEditSkill(skill: Skill): void {
    this.skillToEdit = skill;
    this.isFormModalOpen = true;
  }

  onCloseForm(): void {
    this.isFormModalOpen = false;
    this.skillToEdit = null;
  }

  onSaveSkill(skillData: Omit<Skill, 'id' | 'createdAt'>): void {
    if (this.skillToEdit) {
      this.skillsService.updateSkill(this.skillToEdit.id, skillData);
    } else {
      this.skillsService.addSkill(skillData);
    }
    this.onCloseForm();
  }

  onViewDetail(skill: Skill): void {
    this.selectedSkillForDetail = skill;
    this.isDetailModalOpen = true;
  }

  onCloseDetail(): void {
    this.isDetailModalOpen = false;
    this.selectedSkillForDetail = null;
  }

  onConfirmDelete(skill: Skill): void {
    this.skillToDelete = skill;
    this.isDeleteModalOpen = true;
  }

  executeDelete(): void {
    if (this.skillToDelete) {
      this.skillsService.deleteSkill(this.skillToDelete.id);
      this.skillToDelete = null;
      this.isDeleteModalOpen = false;
    }
  }

  cancelDelete(): void {
    this.skillToDelete = null;
    this.isDeleteModalOpen = false;
  }
}
