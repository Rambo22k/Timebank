import { Routes } from '@angular/router';
import { authGuard, onboardingGuard } from './core/guards/auth.guard';

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
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/skills/skills-management.page').then(m => m.SkillsManagementPage),
    title: 'Mis Habilidades — TimeBank'
  },
  {
    path: 'exchanges/requests',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exchanges/requests.page').then(m => m.ExchangeRequestsPage),
    title: 'Solicitudes de Intercambio — TimeBank'
  },
  {
    path: 'exchanges/messages',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exchanges/messages.page').then(m => m.ExchangeMessagesPage),
    title: 'Mensajes — TimeBank'
  },
  {
    path: 'exchanges/sessions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exchanges/sessions.page').then(m => m.ExchangeSessionsPage),
    title: 'Mis Sesiones — TimeBank'
  },
  {
    path: 'wallet',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exchanges/wallet.page').then(m => m.WalletPage),
    title: 'Billetera de Tiempo — TimeBank'
  },
  {
    path: 'solidarity',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/solidarity/solidarity.page').then(m => m.SolidarityPage),
    title: 'Horas Solidarias — TimeBank'
  },
  {
    path: 'exchanges/reviews',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exchanges/reviews.page').then(m => m.ExchangeReviewsPage),
    title: 'Reseñas — TimeBank'
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/profile/profile.page').then(m => m.ProfilePage),
    title: 'Mi Perfil — TimeBank'
  },
  {
    path: 'profile/:id',
    canActivate: [authGuard],
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
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/auth-callback.page').then(m => m.AuthCallbackPage),
    title: 'Confirmando acceso — TimeBank'
  },
  {
    path: 'auth/complete-profile',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/auth/complete-profile.page').then(m => m.CompleteProfilePage),
    title: 'Completar Perfil — TimeBank'
  },
  {
    path: 'auth/update-password',
    loadComponent: () =>
      import('./features/auth/update-password.page').then(m => m.UpdatePasswordPage),
    title: 'Cambiar Contraseña — TimeBank'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
