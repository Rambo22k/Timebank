import { Injectable, signal, computed } from '@angular/core';
import { Skill, SkillType } from '../models/skill.model';
import { SkillCategory } from '../models/category.model';
import { MOCK_SKILLS } from '../mock-data/skills.mock';
import { MOCK_CATEGORIES } from '../mock-data/categories.mock';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class SkillsService {
  private skillsSignal = signal<Skill[]>([...MOCK_SKILLS]);
  private categoriesSignal = signal<SkillCategory[]>([...MOCK_CATEGORIES]);

  readonly skills = this.skillsSignal.asReadonly();
  readonly categories = this.categoriesSignal.asReadonly();

  readonly totalSkillsCount = computed(() => this.skillsSignal().length);
  readonly offeredCount = computed(
    () => this.skillsSignal().filter(s => s.type === 'offered').length
  );
  readonly wantedCount = computed(
    () => this.skillsSignal().filter(s => s.type === 'wanted').length
  );

  constructor(private toastService: ToastService) {}

  getSkillById(id: string): Skill | undefined {
    return this.skillsSignal().find(s => s.id === id);
  }

  getSkillsByUser(userId: string): Skill[] {
    return this.skillsSignal().filter(s => s.userId === userId);
  }

  getOfferedSkillsByUser(userId: string): Skill[] {
    return this.skillsSignal().filter(s => s.userId === userId && s.type === 'offered');
  }

  getWantedSkillsByUser(userId: string): Skill[] {
    return this.skillsSignal().filter(s => s.userId === userId && s.type === 'wanted');
  }

  addSkill(newSkillData: Omit<Skill, 'id' | 'createdAt'>): Skill {
    const id = 'skill-' + Date.now();
    const newSkill: Skill = {
      ...newSkillData,
      id,
      createdAt: new Date().toISOString().split('T')[0]
    };

    this.skillsSignal.update(skills => [newSkill, ...skills]);
    this.updateCategoryCount(newSkill.categoryId, 1);
    this.toastService.success(
      newSkill.type === 'offered'
        ? '¡Habilidad ofrecida publicada con éxito!'
        : '¡Habilidad solicitada publicada con éxito!'
    );
    return newSkill;
  }

  updateSkill(id: string, updates: Partial<Skill>): boolean {
    const prev = this.getSkillById(id);
    if (!prev) return false;

    const updated: Skill = { ...prev, ...updates };
    this.skillsSignal.update(skills =>
      skills.map(s => (s.id === id ? updated : s))
    );

    this.toastService.success('Habilidad actualizada correctamente.');
    return true;
  }

  deleteSkill(id: string): boolean {
    const skill = this.getSkillById(id);
    if (!skill) return false;

    this.skillsSignal.update(skills => skills.filter(s => s.id !== id));
    this.updateCategoryCount(skill.categoryId, -1);
    this.toastService.warning('Habilidad eliminada de la lista.');
    return true;
  }

  private updateCategoryCount(categoryId: string, delta: number): void {
    this.categoriesSignal.update(categories =>
      categories.map(c =>
        c.id === categoryId
          ? { ...c, skillsCount: Math.max(0, c.skillsCount + delta) }
          : c
      )
    );
  }

  searchSkills(
    query = '',
    categoryId = 'all',
    type: 'all' | SkillType = 'all',
    modality = 'all',
    sortBy: 'recent' | 'rating' | 'alphabetical' = 'recent'
  ): Skill[] {
    let result = [...this.skillsSignal()];

    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        s =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.authorName.toLowerCase().includes(q) ||
          s.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }

    if (categoryId && categoryId !== 'all') {
      result = result.filter(s => s.categoryId === categoryId);
    }

    if (type && type !== 'all') {
      result = result.filter(s => s.type === type);
    }

    if (modality && modality !== 'all') {
      result = result.filter(s => s.modality.toLowerCase() === modality.toLowerCase());
    }

    if (sortBy === 'rating') {
      result.sort((a, b) => (b.authorRating || 0) - (a.authorRating || 0));
    } else if (sortBy === 'alphabetical') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      // recent
      result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    return result;
  }
}
