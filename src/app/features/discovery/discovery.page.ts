import { Component, signal, computed, OnInit } from '@angular/core';
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
  layersOutline
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

@Component({
  selector: 'app-discovery',
  standalone: true,
  imports: [
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
  searchQuery = signal<string>('');
  selectedCategoryId = signal<string>('all');
  selectedType = signal<'all' | SkillType>('all');
  selectedModality = signal<string>('all');
  sortBy = signal<'recent' | 'rating' | 'alphabetical'>('recent');

  selectedSkillForDetail: Skill | null = null;
  isDetailModalOpen = false;

  selectedSkillForExchange: Skill | null = null;
  isExchangeModalOpen = false;

  constructor(
    public skillsService: SkillsService,
    public authService: AuthService,
    private route: ActivatedRoute
  ) {
    addIcons({
      searchOutline,
      closeCircleOutline,
      filterOutline,
      sparklesOutline,
      swapHorizontalOutline,
      locationOutline,
      funnelOutline,
      refreshOutline,
      layersOutline
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

  get filteredSkills(): Skill[] {
    return this.skillsService.searchSkills(
      this.searchQuery(),
      this.selectedCategoryId(),
      this.selectedType(),
      this.selectedModality(),
      this.sortBy()
    );
  }

  get hasActiveFilters(): boolean {
    return (
      this.searchQuery().trim().length > 0 ||
      this.selectedCategoryId() !== 'all' ||
      this.selectedType() !== 'all' ||
      this.selectedModality() !== 'all' ||
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
}
