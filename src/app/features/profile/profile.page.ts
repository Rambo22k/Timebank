import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
  shareSocialOutline,
  shieldCheckmarkOutline,
  cloudUploadOutline,
  peopleOutline,
  personAddOutline,
  flagOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { SkillCardComponent } from '../../shared/components/skill-card/skill-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { EditProfileModalComponent, ProfileEditSubmission } from './edit-profile-modal/edit-profile-modal.component';
import { SkillDetailModalComponent } from '../skills/skill-detail-modal/skill-detail-modal.component';
import { SkillFormModalComponent } from '../skills/skill-form-modal/skill-form-modal.component';
import { ConfirmationModalComponent } from '../../shared/components/confirmation-modal/confirmation-modal.component';
import { ExchangeModalComponent } from '../discovery/exchange-modal/exchange-modal.component';
import { AuthService } from '../../core/services/auth.service';
import { SkillsService } from '../../core/services/skills.service';
import { ToastService } from '../../core/services/toast.service';
import { UserProfile } from '../../core/models/user.model';
import { Skill } from '../../core/models/skill.model';
import { IdentityVerificationService } from '../../core/services/identity-verification.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ContactsService } from '../../core/services/contacts.service';
import { AvailabilityService } from '../../core/services/availability.service';
import { COUNTRY_OPTIONS, languageLabel } from '../../core/data/localization-options';
import { LocalizationService } from '../../core/services/localization.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { ChatService } from '../../core/services/chat.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    TranslatePipe,
    CommonModule,
    FormsModule,
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
  authService = inject(AuthService);
  localization = inject(LocalizationService);
  skillsService = inject(SkillsService);
  private toastService = inject(ToastService);
  verification = inject(IdentityVerificationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  contacts = inject(ContactsService);
  availability = inject(AvailabilityService);
  chat = inject(ChatService);

  activeTab = signal<'offered' | 'wanted'>('offered');
  private readonly viewedProfileId = signal<string | null>(null);
  readonly publicProfile = signal<UserProfile | null>(null);
  readonly profileLoading = signal(false);
  readonly profileUnavailable = signal(false);
  isEditProfileModalOpen = false;
  isSavingProfile = false;
  isDeactivateModalOpen = false;
  isDeactivatingAccount = false;
  reportReason = '';
  isReportingProfile = false;
  isBlockProfileModalOpen = false;

  // Skill CRUD modals
  selectedSkillForDetail: Skill | null = null;
  detailModalOpen = false;

  skillToEdit: Skill | null = null;
  isSkillFormOpen = false;
  isSavingSkill = false;

  skillToDelete: Skill | null = null;
  isDeleteModalOpen = false;

  selectedSkillForExchange: Skill | null = null;
  exchangeModalOpen = false;
  readonly weekdays = [
    { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' },
    { value: 0, label: 'Domingo' }
  ];
  newAvailabilityWeekday = 1;
  newAvailabilityStart = '09:00';
  newAvailabilityEnd = '12:00';
  availabilityTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  private readonly countryOptions = COUNTRY_OPTIONS;

  constructor() {
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
      shareSocialOutline,
      shieldCheckmarkOutline,
      cloudUploadOutline,
      peopleOutline,
      personAddOutline,
      flagOutline
    });
    this.route.paramMap.subscribe(params => {
      const profileId = params.get('id');
      this.viewedProfileId.set(profileId);
      this.publicProfile.set(null);
      this.profileUnavailable.set(false);
      void this.chat.loadBlockedUsers();
      if (!profileId || profileId === this.authService.authUser()?.id) {
        const userId = this.authService.authUser()?.id;
        if (userId) void this.availability.load(userId);
        void Promise.all([
          this.authService.reloadAuthenticatedUser(),
          this.verification.load()
        ]);
      } else {
        void this.availability.load(profileId);
        void this.contacts.loadRelationship(profileId);
        void this.loadPublicProfile(profileId);
      }
    });
  }

  get user(): UserProfile | null {
    const profileId = this.viewedProfileId();
    if (!profileId || profileId === this.authService.authUser()?.id) return this.authService.currentUser();
    return this.publicProfile();
  }

  get isOwnProfile(): boolean {
    const profileId = this.viewedProfileId();
    return !profileId || profileId === this.authService.authUser()?.id;
  }

  get isViewedProfileBlocked(): boolean {
    const profile = this.user;
    return !!profile && this.chat.blockedUsers().some(item => item.id === profile.id);
  }

  private async loadPublicProfile(profileId: string): Promise<void> {
    const client = this.supabase.client;
    if (!client) { this.profileUnavailable.set(true); return; }
    this.profileLoading.set(true);
    try {
      const { data, error } = await client.from('profiles')
        .select('id,display_name,headline,location,country_code,timezone,avatar_path,bio,reputation_average,reputation_count,offered_hours,received_hours,completed_sessions,created_at,is_verified')
        .eq('id', profileId)
        .maybeSingle();
      if (error) throw error;
      if (!data) { this.profileUnavailable.set(true); return; }
      const { data: languageRows, error: languageError } = await client.from('profile_languages')
        .select('language_code').eq('user_id', profileId);
      if (languageError) throw languageError;
      const avatar = data.avatar_path
        ? (/^https?:\/\//i.test(data.avatar_path) ? data.avatar_path : client.storage.from('profile-avatars').getPublicUrl(data.avatar_path).data.publicUrl)
        : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80';
      this.publicProfile.set({
        id: data.id,
        name: data.display_name,
        email: '',
        headline: data.headline ?? 'Miembro de la comunidad TimeBank',
        bio: data.bio ?? '',
        avatar,
        location: data.location ?? data.country_code ?? 'En línea',
        countryCode: String(data.country_code ?? '').trim().toUpperCase(),
        timezone: data.timezone ?? 'UTC',
        languages: (languageRows ?? []).map(row => row.language_code),
        preferredLanguage: 'es',
        timeCredits: 0,
        hoursGiven: Number(data.offered_hours ?? 0),
        hoursReceived: Number(data.received_hours ?? 0),
        completedExchanges: Number(data.completed_sessions ?? 0),
        memberSince: new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' }).format(new Date(data.created_at)),
        rating: Number(data.reputation_average ?? 0),
        reviewsCount: Number(data.reputation_count ?? 0),
        isVerified: data.is_verified,
        badges: data.is_verified ? ['Miembro verificado'] : []
      });
    } catch {
      this.profileUnavailable.set(true);
      this.toastService.danger('No se pudo cargar el perfil de este miembro.');
    } finally {
      this.profileLoading.set(false);
    }
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

  async onVerificationFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) await this.verification.submit(file);
    input.value = '';
  }

  async connectToProfile(): Promise<void> {
    const profile = this.user;
    const relation = this.contacts.activeProfileContact();
    if (!profile || this.isOwnProfile) return;
    if (relation?.status === 'pending' && relation.recipient_id === this.authService.authUser()?.id) {
      await this.contacts.respond(relation.id, true);
    } else if (!relation || relation.status === 'rejected') {
      await this.contacts.sendRequest(profile.id);
    }
  }

  async reportViewedProfile(): Promise<void> {
    const profile = this.user;
    if (!profile || this.isOwnProfile || this.isReportingProfile) return;
    this.isReportingProfile = true;
    try {
      if (await this.chat.reportUser(profile.id, this.reportReason)) this.reportReason = '';
    } finally {
      this.isReportingProfile = false;
    }
  }

  async blockViewedProfile(): Promise<void> {
    const profile = this.user;
    if (!profile || this.isOwnProfile) return;
    if (await this.chat.blockUser(profile.id)) this.isBlockProfileModalOpen = false;
  }

  async unblockProfile(userId: string): Promise<void> { await this.chat.unblockUser(userId); }

  async addAvailabilitySlot(): Promise<void> {
    await this.availability.addSlot(
      this.newAvailabilityWeekday,
      this.newAvailabilityStart,
      this.newAvailabilityEnd,
      this.availabilityTimezone
    );
  }

  weekdayLabel(weekday: number): string { return this.weekdays.find(day => day.value === weekday)?.label ?? 'Día'; }

  countryLabel(countryCode: string): string {
    const locale = this.localization.language() === 'en' ? 'en' : 'es';
    return new Intl.DisplayNames([locale], { type: 'region' }).of(countryCode) ?? this.countryOptions.find(country => country.code === countryCode)?.name ?? countryCode;
  }

  languageLabel(languageCode: string): string { return languageLabel(languageCode, this.localization.language()); }

  closeEditProfile(): void {
    this.isEditProfileModalOpen = false;
  }

  async onSaveProfile(submission: ProfileEditSubmission): Promise<void> {
    this.isSavingProfile = true;
    try {
      await this.authService.updateCurrentUserProfile(submission.updates, true, submission.avatarFile ?? undefined);
      this.closeEditProfile();
    } catch (error) {
      this.toastService.danger(error instanceof Error ? error.message : 'No se pudo actualizar el perfil.');
    } finally {
      this.isSavingProfile = false;
    }
  }

  async deactivateOwnAccount(): Promise<void> {
    if (!this.isOwnProfile || this.isDeactivatingAccount) return;
    this.isDeactivatingAccount = true;
    try {
      const { error } = await this.supabase.requireClient().rpc('deactivate_my_account');
      if (error) throw error;
      this.isDeactivateModalOpen = false;
      await this.authService.logout();
      this.toastService.success('Tu cuenta fue desactivada. Puedes contactar al equipo si deseas reactivarla.');
      await this.router.navigate(['/']);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Finish or cancel your open sessions and requests')) {
        this.toastService.warning('Antes de desactivar la cuenta, cancela o completa tus solicitudes y sesiones abiertas.');
      } else {
        this.toastService.danger('No se pudo desactivar la cuenta. Inténtalo de nuevo.');
      }
    } finally {
      this.isDeactivatingAccount = false;
    }
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

  async onSaveSkill(skillData: Omit<Skill, 'id' | 'createdAt'>): Promise<void> {
    this.isSavingSkill = true;
    try {
      const saved = this.skillToEdit
        ? await this.skillsService.updateSkill(this.skillToEdit.id, skillData)
        : await this.skillsService.addSkill(skillData);
      if (saved) this.onCloseSkillForm();
    } finally {
      this.isSavingSkill = false;
    }
  }

  onConfirmDeleteSkill(skill: Skill): void {
    this.skillToDelete = skill;
    this.isDeleteModalOpen = true;
  }

  async executeDeleteSkill(): Promise<void> {
    if (this.skillToDelete) {
      const deleted = await this.skillsService.deleteSkill(this.skillToDelete.id);
      if (deleted) {
        this.skillToDelete = null;
        this.isDeleteModalOpen = false;
      }
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
