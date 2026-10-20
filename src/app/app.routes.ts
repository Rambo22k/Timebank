import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/landing/landing.page').then(m => m.LandingPage),
    title: 'TimeBank — Intercambio de Tiempo y Habilidades'
  },
  {
    path: 'explore',
    loadComponent: () =>
      import('./features/discovery/discovery.page').then(m => m.DiscoveryPage),
    title: 'Explorar Habilidades — TimeBank'
  },
  {
    path: 'skills',
    loadComponent: () =>
      import('./features/skills/skills-management.page').then(m => m.SkillsManagementPage),
    title: 'Mis Habilidades — TimeBank'
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./features/profile/profile.page').then(m => m.ProfilePage),
    title: 'Mi Perfil — TimeBank'
  },
  {
    path: 'profile/:id',
    loadComponent: () =>
      import('./features/profile/profile.page').then(m => m.ProfilePage),
    title: 'Perfil de Usuario — TimeBank'
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login/login.page').then(m => m.LoginPage),
    title: 'Iniciar Sesión — TimeBank'
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register.page').then(m => m.RegisterPage),
    title: 'Registrarse — TimeBank'
  },
  {
    path: 'auth/forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.page').then(m => m.ForgotPasswordPage),
    title: 'Recuperar Contraseña — TimeBank'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
