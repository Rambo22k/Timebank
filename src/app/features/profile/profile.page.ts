import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  timeOutline,
  star,
  locationOutline,
  createOutline,
  calendarOutline,
  sparklesOutline,
  swapHorizontalOutline,
  ribbonOutline,
  checkmarkCircleOutline,
  arrowForwardOutline,
  layersOutline,
  personCircleOutline,
  shareSocialOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { SkillCardComponent } from '../../shared/components/skill-card/skill-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { EditProfileModalComponent } from './edit-profile-modal/edit-profile-modal.component';
import { SkillDetailModalComponent } from '../skills/skill-detail-modal/skill-detail-modal.component';
import { SkillFormModalComponent } from '../skills/skill-form-modal/skill-form-modal.component';
import { ConfirmationModalComponent } from '../../shared/components/confirmation-modal/confirmation-modal.component';
import { ExchangeModalComponent } from '../discovery/exchange-modal/exchange-modal.component';
import { AuthService } from '../../core/services/auth.service';
import { SkillsService } from '../../core/services/skills.service';
import { ToastService } from '../../core/services/toast.service';
import { UserProfile } from '../../core/models/user.model';
import { Skill } from '../../core/models/skill.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonIcon,
    NavbarComponent,
    FooterComponent,
    SkillCardComponent,
    EmptyStateComponent,
    EditProfileModalComponent,
    SkillDetailModalComponent,
    SkillFormModalComponent,
    ConfirmationModalComponent,
    ExchangeModalComponent
  ],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss']
})
export class ProfilePage {
  activeTab = signal<'offered' | 'wanted'>('offered');
  isEditProfileModalOpen = false;

  // Skill CRUD modals
  selectedSkillForDetail: Skill | null = null;
  detailModalOpen = false;

  skillToEdit: Skill | null = null;
  isSkillFormOpen = false;

  skillToDelete: Skill | null = null;
  isDeleteModalOpen = false;

  selectedSkillForExchange: Skill | null = null;
  exchangeModalOpen = false;

  constructor(
    public authService: AuthService,
    public skillsService: SkillsService,
    private toastService: ToastService
  ) {
    addIcons({
      timeOutline,
      star,
      locationOutline,
      createOutline,
      calendarOutline,
      sparklesOutline,
      swapHorizontalOutline,
      ribbonOutline,
      checkmarkCircleOutline,
      arrowForwardOutline,
      layersOutline,
      personCircleOutline,
      shareSocialOutline
    });
  }

  get user(): UserProfile | null {
    return this.authService.currentUser();
  }

  get offeredSkills(): Skill[] {
    const u = this.user;
    return u ? this.skillsService.getOfferedSkillsByUser(u.id) : [];
  }

  get wantedSkills(): Skill[] {
    const u = this.user;
    return u ? this.skillsService.getWantedSkillsByUser(u.id) : [];
  }

  setActiveTab(tab: 'offered' | 'wanted'): void {
    this.activeTab.set(tab);
  }

  openEditProfile(): void {
    this.isEditProfileModalOpen = true;
  }

  closeEditProfile(): void {
    this.isEditProfileModalOpen = false;
  }

  onSaveProfile(updates: Partial<UserProfile>): void {
    this.authService.updateCurrentUserProfile(updates);
    this.closeEditProfile();
  }

  switchPerspective(userId: string): void {
    this.authService.switchUser(userId);
  }

  // Skill interactions
  onViewSkillDetail(skill: Skill): void {
    this.selectedSkillForDetail = skill;
    this.detailModalOpen = true;
  }

  onCloseSkillDetail(): void {
    this.detailModalOpen = false;
    this.selectedSkillForDetail = null;
  }

  openNewSkillModal(): void {
    this.skillToEdit = null;
    this.isSkillFormOpen = true;
  }

  onEditSkill(skill: Skill): void {
    this.skillToEdit = skill;
    this.isSkillFormOpen = true;
  }

  onCloseSkillForm(): void {
    this.isSkillFormOpen = false;
    this.skillToEdit = null;
  }

  onSaveSkill(skillData: Omit<Skill, 'id' | 'createdAt'>): void {
    if (this.skillToEdit) {
      this.skillsService.updateSkill(this.skillToEdit.id, skillData);
    } else {
      this.skillsService.addSkill(skillData);
    }
    this.onCloseSkillForm();
  }

  onConfirmDeleteSkill(skill: Skill): void {
    this.skillToDelete = skill;
    this.isDeleteModalOpen = true;
  }

  executeDeleteSkill(): void {
    if (this.skillToDelete) {
      this.skillsService.deleteSkill(this.skillToDelete.id);
      this.skillToDelete = null;
      this.isDeleteModalOpen = false;
    }
  }

  cancelDeleteSkill(): void {
    this.skillToDelete = null;
    this.isDeleteModalOpen = false;
  }

  onExchange(skill: Skill): void {
    this.selectedSkillForExchange = skill;
    this.exchangeModalOpen = true;
  }

  onCloseExchange(): void {
    this.exchangeModalOpen = false;
    this.selectedSkillForExchange = null;
  }
}
