import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  closeCircleOutline,
  filterOutline,
  sparklesOutline,
  swapHorizontalOutline,
  locationOutline,
  funnelOutline,
  refreshOutline,
  layersOutline,
  peopleOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { SkillCardComponent } from '../../shared/components/skill-card/skill-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { SkillDetailModalComponent } from '../skills/skill-detail-modal/skill-detail-modal.component';
import { ExchangeModalComponent } from './exchange-modal/exchange-modal.component';
import { SkillsService } from '../../core/services/skills.service';
import { AuthService } from '../../core/services/auth.service';
import { Skill, SkillType } from '../../core/models/skill.model';
import { SkillCategory } from '../../core/models/category.model';
import { countryOptionsFor, languageOptionsFor } from '../../core/data/localization-options';
import { LocalizationService } from '../../core/services/localization.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

interface MemberSkillMatch {
  userId: string;
  name: string;
  avatar: string;
  learnTitles: string[];
  teachTitles: string[];
  reciprocal: boolean;
}

@Component({
  selector: 'app-discovery',
  standalone: true,
  imports: [
    TranslatePipe,
    CommonModule,
    RouterModule,
    FormsModule,
    IonIcon,
    NavbarComponent,
    FooterComponent,
    SkillCardComponent,
    EmptyStateComponent,
    SkillDetailModalComponent,
    ExchangeModalComponent
  ],
  templateUrl: './discovery.page.html',
  styleUrls: ['./discovery.page.scss']
})
export class DiscoveryPage implements OnInit {
  skillsService = inject(SkillsService);
  authService = inject(AuthService);
  localization = inject(LocalizationService);
  private route = inject(ActivatedRoute);

  searchQuery = signal<string>('');
  selectedCategoryId = signal<string>('all');
  selectedType = signal<'all' | SkillType>('all');
  selectedModality = signal<string>('all');
  sortBy = signal<'recent' | 'rating' | 'alphabetical'>('recent');
  selectedCountryCode = signal('all');
  selectedLanguageCode = signal('all');
  get countries() { return countryOptionsFor(this.localization.language()); }
  get spokenLanguages() { return languageOptionsFor(this.localization.language()); }

  selectedSkillForDetail: Skill | null = null;
  isDetailModalOpen = false;

  selectedSkillForExchange: Skill | null = null;
  isExchangeModalOpen = false;

  constructor() {
    addIcons({
      searchOutline,
      closeCircleOutline,
      filterOutline,
      sparklesOutline,
      swapHorizontalOutline,
      locationOutline,
      funnelOutline,
      refreshOutline,
      layersOutline,
      peopleOutline
    });
  }

  ngOnInit(): void {
    // Check if category came in query params from landing
    this.route.queryParams.subscribe(params => {
      if (params['category']) {
        this.selectedCategoryId.set(params['category']);
      }
      if (params['type']) {
        this.selectedType.set(params['type']);
      }
      if (params['q']) {
        this.searchQuery.set(params['q']);
      }
    });
  }

  get categories(): SkillCategory[] {
    return this.skillsService.categories();
  }

  readonly recommendedMatches = computed<MemberSkillMatch[]>(() => {
    const userId = this.authService.authUser()?.id;
    if (!userId) return [];
    const allSkills = this.skillsService.skills().filter(skill => skill.status === 'active');
    const mine = allSkills.filter(skill => skill.userId === userId);
    const wanted = mine.filter(skill => skill.type === 'wanted');
    const offered = mine.filter(skill => skill.type === 'offered');
    const members = new Map<string, Skill[]>();
    for (const skill of allSkills) {
      if (skill.userId === userId) continue;
      const memberSkills = members.get(skill.userId) ?? [];
      memberSkills.push(skill);
      members.set(skill.userId, memberSkills);
    }

    return [...members.entries()].flatMap(([peerId, peerSkills]) => {
      const learnTitles = wanted.filter(need => peerSkills.some(skill => skill.type === 'offered' && this.skillsMatch(need, skill))).map(skill => skill.title);
      const teachTitles = offered.filter(skill => peerSkills.some(need => need.type === 'wanted' && this.skillsMatch(skill, need))).map(skill => skill.title);
      if (!learnTitles.length && !teachTitles.length) return [];
      const peer = peerSkills[0];
      return [{
        userId: peerId,
        name: peer.authorName,
        avatar: peer.authorAvatar,
        learnTitles: [...new Set(learnTitles)].slice(0, 2),
        teachTitles: [...new Set(teachTitles)].slice(0, 2),
        reciprocal: learnTitles.length > 0 && teachTitles.length > 0
      }];
    }).sort((a, b) => Number(b.reciprocal) - Number(a.reciprocal)).slice(0, 4);
  });

  get filteredSkills(): Skill[] {
    const currentUserId = this.authService.authUser()?.id;
    return this.skillsService.searchSkills(
      this.searchQuery(),
      this.selectedCategoryId(),
      this.selectedType(),
      this.selectedModality(),
      this.sortBy()
    ).filter(skill => skill.userId !== currentUserId
      && (this.selectedCountryCode() === 'all' || skill.authorCountryCode === this.selectedCountryCode())
      && (this.selectedLanguageCode() === 'all' || skill.authorLanguages?.includes(this.selectedLanguageCode())));
  }

  get hasActiveFilters(): boolean {
    return (
      this.searchQuery().trim().length > 0 ||
      this.selectedCategoryId() !== 'all' ||
      this.selectedType() !== 'all' ||
      this.selectedModality() !== 'all' ||
      this.selectedCountryCode() !== 'all' ||
      this.selectedLanguageCode() !== 'all' ||
      this.sortBy() !== 'recent'
    );
  }

  setCategory(catId: string): void {
    this.selectedCategoryId.set(catId);
  }

  setType(type: 'all' | SkillType): void {
    this.selectedType.set(type);
  }

  setModality(modality: string): void {
    this.selectedModality.set(modality);
  }

  setCountry(countryCode: string): void { this.selectedCountryCode.set(countryCode); }

  setSpokenLanguage(languageCode: string): void { this.selectedLanguageCode.set(languageCode); }

  setSort(sort: 'recent' | 'rating' | 'alphabetical'): void {
    this.sortBy.set(sort);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategoryId.set('all');
    this.selectedType.set('all');
    this.selectedModality.set('all');
    this.selectedCountryCode.set('all');
    this.selectedLanguageCode.set('all');
    this.sortBy.set('recent');
  }

  onViewDetail(skill: Skill): void {
    this.selectedSkillForDetail = skill;
    this.isDetailModalOpen = true;
  }

  onCloseDetail(): void {
    this.isDetailModalOpen = false;
    this.selectedSkillForDetail = null;
  }

  onExchange(skill: Skill): void {
    this.selectedSkillForExchange = skill;
    this.isExchangeModalOpen = true;
  }

  onCloseExchange(): void {
    this.isExchangeModalOpen = false;
    this.selectedSkillForExchange = null;
  }

  private skillsMatch(first: Skill, second: Skill): boolean {
    if (first.categoryId !== second.categoryId) return false;
    const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const leftTitle = normalize(first.title);
    const rightTitle = normalize(second.title);
    if (leftTitle === rightTitle) return true;
    const stopWords = new Set(['con', 'para', 'por', 'las', 'los', 'del', 'una', 'uno', 'the', 'and', 'for', 'with', 'learn', 'aprender', 'quiero', 'busco', 'ofrezco', 'idioma', 'clases']);
    const terms = (skill: Skill) => new Set([...skill.title.split(/[^\p{L}\p{N}]+/u), ...skill.tags]
      .map(normalize).filter(term => term.length > 2 && !stopWords.has(term)));
    const leftTerms = terms(first);
    const rightTerms = terms(second);
    return [...leftTerms].some(term => rightTerms.has(term));
  }
}
