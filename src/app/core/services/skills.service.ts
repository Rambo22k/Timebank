import { Injectable, computed, effect, signal, inject } from '@angular/core';
import { addIcons } from 'ionicons';
import {
  schoolOutline,
  laptopOutline,
  globeOutline,
  colorPaletteOutline,
  heartOutline,
  homeOutline,
  briefcaseOutline,
  musicalNotesOutline,
  barbellOutline,
  ellipsisHorizontalOutline,
  sparklesOutline
} from 'ionicons/icons';
import { Skill, SkillLevel, SkillModality, SkillType } from '../models/skill.model';
import { SkillCategory } from '../models/category.model';
import { ToastService } from './toast.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
}

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_path: string | null;
  headline: string | null;
  location: string | null;
  country_code: string | null;
  reputation_average: number | null;
  is_verified: boolean;
}

interface SkillRow {
  id: string;
  user_id: string;
  category_id: string;
  skill_type: 'offered' | 'wanted';
  title: string;
  description: string;
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'any';
  modality: 'online' | 'in_person' | 'hybrid';
  tags: string[] | null;
  availability_note: string | null;
  location: string | null;
  is_featured: boolean;
  created_at: string;
  status: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  book: 'school-outline',
  laptop: 'laptop-outline',
  globe: 'globe-outline',
  palette: 'color-palette-outline',
  heart: 'heart-outline',
  home: 'home-outline',
  briefcase: 'briefcase-outline',
  'musical-note': 'musical-notes-outline',
  fitness: 'barbell-outline',
  'ellipsis-horizontal': 'ellipsis-horizontal-outline'
};

const CATEGORY_COLORS = ['#087B76', '#F59A00', '#075B58', '#F59A00'];

@Injectable({ providedIn: 'root' })
export class SkillsService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private toastService = inject(ToastService);

  private skillsSignal = signal<Skill[]>([]);
  private categoriesSignal = signal<SkillCategory[]>([]);
  private loadingSignal = signal(false);
  private loadVersion = 0;

  readonly skills = this.skillsSignal.asReadonly();
  readonly categories = this.categoriesSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly totalSkillsCount = computed(() => this.skillsSignal().length);
  readonly offeredCount = computed(() => this.skillsSignal().filter(skill => skill.type === 'offered').length);
  readonly wantedCount = computed(() => this.skillsSignal().filter(skill => skill.type === 'wanted').length);

  constructor() {
    addIcons({
      'school-outline': schoolOutline,
      'laptop-outline': laptopOutline,
      'globe-outline': globeOutline,
      'color-palette-outline': colorPaletteOutline,
      'heart-outline': heartOutline,
      'home-outline': homeOutline,
      'briefcase-outline': briefcaseOutline,
      'musical-notes-outline': musicalNotesOutline,
      'barbell-outline': barbellOutline,
      'ellipsis-horizontal-outline': ellipsisHorizontalOutline,
      'sparkles-outline': sparklesOutline
    });
    effect(() => {
      this.auth.authUser()?.id;
      void this.load();
    });
  }

  async load(): Promise<void> {
    const version = ++this.loadVersion;
    const client = this.supabase.client;
    if (!client) {
      this.skillsSignal.set([]);
      this.categoriesSignal.set([]);
      return;
    }

    this.loadingSignal.set(true);
    try {
      const [categoryResult, skillResult] = await Promise.all([
        client.from('categories')
          .select('id, name, slug, icon, description, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        client.from('skills')
          .select('id, user_id, category_id, skill_type, title, description, skill_level, modality, tags, availability_note, location, is_featured, created_at, status')
          .order('created_at', { ascending: false })
      ]);
      if (categoryResult.error || skillResult.error) throw new Error('load_failed');

      const categoryRows = (categoryResult.data ?? []) as CategoryRow[];
      const skillRows = (skillResult.data ?? []) as SkillRow[];
      const userIds = [...new Set(skillRows.map(skill => skill.user_id))];
      let profileRows: ProfileRow[] = [];
      if (userIds.length) {
        const profileResult = await client.from('profiles')
          .select('id, display_name, avatar_path, headline, location, country_code, reputation_average, is_verified')
          .in('id', userIds);
        if (profileResult.error) throw new Error('load_failed');
        profileRows = (profileResult.data ?? []) as ProfileRow[];
      }

      if (version !== this.loadVersion) return;
      const categoryById = new Map(categoryRows.map(category => [category.id, category]));
      const profileById = new Map(profileRows.map(profile => [profile.id, profile]));
      const mappedSkills = skillRows.map(row => this.mapSkill(row, categoryById.get(row.category_id), profileById.get(row.user_id)));
      const activeCounts = new Map<string, number>();
      for (const row of skillRows) {
        if (row.status === 'active') activeCounts.set(row.category_id, (activeCounts.get(row.category_id) ?? 0) + 1);
      }

      this.skillsSignal.set(mappedSkills);
      this.categoriesSignal.set(categoryRows.map((category, index) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        icon: CATEGORY_ICONS[category.icon ?? ''] ?? 'sparkles-outline',
        description: category.description ?? '',
        skillsCount: activeCounts.get(category.id) ?? 0,
        colorAccent: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
      })));
    } catch {
      if (version === this.loadVersion) {
        this.toastService.danger('No se pudieron cargar las habilidades. Inténtalo de nuevo.');
      }
    } finally {
      if (version === this.loadVersion) this.loadingSignal.set(false);
    }
  }

  getSkillById(id: string): Skill | undefined {
    return this.skillsSignal().find(skill => skill.id === id);
  }

  getSkillsByUser(userId: string): Skill[] {
    return this.skillsSignal().filter(skill => skill.userId === userId);
  }

  getOfferedSkillsByUser(userId: string): Skill[] {
    return this.skillsSignal().filter(skill => skill.userId === userId && skill.type === 'offered');
  }

  getWantedSkillsByUser(userId: string): Skill[] {
    return this.skillsSignal().filter(skill => skill.userId === userId && skill.type === 'wanted');
  }

  async addSkill(newSkill: Omit<Skill, 'id' | 'createdAt'>): Promise<boolean> {
    const userId = this.auth.authUser()?.id;
    if (!userId) {
      this.toastService.warning('Inicia sesión para publicar una habilidad.');
      return false;
    }

    try {
      const { error } = await this.supabase.requireClient().from('skills').insert({
        user_id: userId,
        category_id: newSkill.categoryId,
        skill_type: newSkill.type,
        title: newSkill.title.trim(),
        description: newSkill.description.trim(),
        skill_level: this.toDatabaseLevel(newSkill.level),
        modality: this.toDatabaseModality(newSkill.modality),
        tags: newSkill.tags,
        availability_note: newSkill.availability.trim(),
        location: newSkill.location.trim(),
        is_featured: false
      });
      if (error) throw error;
      await this.load();
      this.toastService.success(newSkill.type === 'offered'
        ? 'Habilidad ofrecida publicada.'
        : 'Habilidad solicitada publicada.');
      return true;
    } catch {
      this.toastService.danger('No se pudo publicar la habilidad. Revisa los datos e inténtalo de nuevo.');
      return false;
    }
  }

  async updateSkill(id: string, updates: Partial<Skill>): Promise<boolean> {
    try {
      const { error, data } = await this.supabase.requireClient().from('skills').update({
        ...(updates.type !== undefined ? { skill_type: updates.type } : {}),
        ...(updates.categoryId !== undefined ? { category_id: updates.categoryId } : {}),
        ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
        ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
        ...(updates.level !== undefined ? { skill_level: this.toDatabaseLevel(updates.level) } : {}),
        ...(updates.modality !== undefined ? { modality: this.toDatabaseModality(updates.modality) } : {}),
        ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
        ...(updates.availability !== undefined ? { availability_note: updates.availability.trim() } : {}),
        ...(updates.location !== undefined ? { location: updates.location.trim() } : {})
      }).eq('id', id).select('id').maybeSingle();
      if (error || !data) throw error ?? new Error('not_found');
      await this.load();
      this.toastService.success('Habilidad actualizada.');
      return true;
    } catch {
      this.toastService.danger('No se pudo actualizar la habilidad. Revisa los datos e inténtalo de nuevo.');
      return false;
    }
  }

  async deleteSkill(id: string): Promise<boolean> {
    try {
      const { error, data } = await this.supabase.requireClient().from('skills')
        .delete().eq('id', id).select('id').maybeSingle();
      if (error || !data) throw error ?? new Error('not_found');
      await this.load();
      this.toastService.warning('Habilidad eliminada.');
      return true;
    } catch {
      this.toastService.danger('No se pudo eliminar la habilidad. Inténtalo de nuevo.');
      return false;
    }
  }

  searchSkills(
    query = '',
    categoryId = 'all',
    type: 'all' | SkillType = 'all',
    modality = 'all',
    sortBy: 'recent' | 'rating' | 'alphabetical' = 'recent'
  ): Skill[] {
    let result = this.skillsSignal().filter(skill => skill.status === 'active');
    const search = query.trim().toLowerCase();
    if (search) {
      result = result.filter(skill => skill.title.toLowerCase().includes(search)
        || skill.description.toLowerCase().includes(search)
        || skill.authorName.toLowerCase().includes(search)
        || skill.tags.some(tag => tag.toLowerCase().includes(search)));
    }
    if (categoryId !== 'all') result = result.filter(skill => skill.categoryId === categoryId);
    if (type !== 'all') result = result.filter(skill => skill.type === type);
    if (modality !== 'all') result = result.filter(skill => skill.modality.toLowerCase() === modality.toLowerCase());
    if (sortBy === 'rating') result.sort((a, b) => (b.authorRating ?? 0) - (a.authorRating ?? 0));
    else if (sortBy === 'alphabetical') result.sort((a, b) => a.title.localeCompare(b.title));
    else result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return result;
  }

  private mapSkill(row: SkillRow, category?: CategoryRow, profile?: ProfileRow): Skill {
    const client = this.supabase.requireClient();
    const avatarPath = profile?.avatar_path;
    const authorAvatar = avatarPath
      ? /^https?:\/\//i.test(avatarPath) ? avatarPath : client.storage.from('profile-avatars').getPublicUrl(avatarPath).data.publicUrl
      : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80';
    return {
      id: row.id,
      userId: row.user_id,
      authorName: profile?.display_name ?? 'Miembro de TimeBank',
      authorAvatar,
      authorHeadline: profile?.headline ?? 'Miembro de la comunidad TimeBank',
      authorLocation: profile?.location ?? profile?.country_code ?? undefined,
      authorRating: Number(profile?.reputation_average ?? 0),
      authorVerified: profile?.is_verified ?? false,
      type: row.skill_type,
      title: row.title,
      categoryId: row.category_id,
      categoryName: category?.name ?? 'Otra categoría',
      description: row.description,
      level: this.fromDatabaseLevel(row.skill_level),
      modality: this.fromDatabaseModality(row.modality),
      hoursValue: 1,
      tags: row.tags ?? [],
      location: row.location ?? '',
      availability: row.availability_note ?? '',
      createdAt: row.created_at,
      featured: row.is_featured,
      status: row.status as Skill['status']
    };
  }

  private toDatabaseLevel(level: SkillLevel): string {
    return ({ Principiante: 'beginner', Intermedio: 'intermediate', Avanzado: 'advanced', Experto: 'expert', Cualquiera: 'any' } as const)[level];
  }

  private fromDatabaseLevel(level: SkillRow['skill_level']): SkillLevel {
    return ({ beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', expert: 'Experto', any: 'Cualquiera' } as const)[level];
  }

  private toDatabaseModality(modality: SkillModality): string {
    return ({ Online: 'online', Presencial: 'in_person', 'Híbrido': 'hybrid' } as const)[modality];
  }

  private fromDatabaseModality(modality: SkillRow['modality']): SkillModality {
    return ({ online: 'Online', in_person: 'Presencial', hybrid: 'Híbrido' } as const)[modality];
  }
}
