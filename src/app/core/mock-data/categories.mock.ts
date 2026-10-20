import { SkillCategory } from '../models/category.model';

export const MOCK_CATEGORIES: SkillCategory[] = [
  {
    id: 'cat-1',
    name: 'Programación & Software',
    slug: 'tech',
    icon: 'code-slash-outline',
    description: 'Desarrollo web, frontend, backend, bases de datos y algoritmos.',
    skillsCount: 14,
    colorAccent: '#087B76'
  },
  {
    id: 'cat-2',
    name: 'Idiomas & Conversación',
    slug: 'languages',
    icon: 'globe-outline',
    description: 'Práctica conversacional, gramática, inglés técnico y francés.',
    skillsCount: 19,
    colorAccent: '#F59A00'
  },
  {
    id: 'cat-3',
    name: 'Diseño & Creatividad',
    slug: 'design',
    icon: 'color-palette-outline',
    description: 'UI/UX, diseño vectorial, branding, Figma e ilustración digital.',
    skillsCount: 11,
    colorAccent: '#075B58'
  },
  {
    id: 'cat-4',
    name: 'Música & Expresión',
    slug: 'music',
    icon: 'musical-notes-outline',
    description: 'Guitarra, piano, teoría musical, producción y canto.',
    skillsCount: 8,
    colorAccent: '#F59A00'
  },
  {
    id: 'cat-5',
    name: 'Ciencias & Apoyo Académico',
    slug: 'academic',
    icon: 'school-outline',
    description: 'Cálculo, física, química, tutoría universitaria y redacción.',
    skillsCount: 12,
    colorAccent: '#087B76'
  },
  {
    id: 'cat-6',
    name: 'Negocios & Finanzas',
    slug: 'business',
    icon: 'briefcase-outline',
    description: 'Modelos de negocio, oratoria, gestión de proyectos y Excel avanzado.',
    skillsCount: 7,
    colorAccent: '#075B58'
  },
  {
    id: 'cat-7',
    name: 'Bienestar & Hábitos',
    slug: 'lifestyle',
    icon: 'heart-outline',
    description: 'Yoga, respiración consciente, ajedrez y organización del tiempo.',
    skillsCount: 6,
    colorAccent: '#F59A00'
  }
];
