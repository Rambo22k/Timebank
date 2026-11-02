export type SkillType = 'offered' | 'wanted';
export type SkillLevel = 'Principiante' | 'Intermedio' | 'Avanzado' | 'Experto' | 'Cualquiera';
export type SkillModality = 'Online' | 'Presencial' | 'Híbrido';

export interface Skill {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  authorHeadline: string;
  authorLocation?: string;
  authorRating?: number;
  type: SkillType;
  title: string;
  categoryId: string;
  categoryName: string;
  description: string;
  level: SkillLevel;
  modality: SkillModality;
  hoursValue: number; // default 1 crédito por hora
  tags: string[];
  location: string;
  availability: string;
  createdAt: string;
  featured?: boolean;
  status?: 'active' | 'hidden' | 'pending_review' | 'rejected' | 'removed';
}
