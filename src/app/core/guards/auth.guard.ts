import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    await auth.ensureInitialized();
  } catch {
    return router.createUrlTree(['/auth/login']);
  }
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  }
  if (auth.accountStatus() !== 'active') {
    return state.url.startsWith('/account-status') ? true : router.createUrlTree(['/account-status']);
  }
  if (state.url.startsWith('/account-status')) return router.createUrlTree(['/profile']);
  if (auth.needsProfileCompletion() && !state.url.startsWith('/auth/complete-profile')) {
    return router.createUrlTree(['/auth/complete-profile']);
  }
  return true;
};

export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    await auth.ensureInitialized();
  } catch {
    return router.createUrlTree(['/auth/login']);
  }
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  if (auth.accountStatus() !== 'active') return router.createUrlTree(['/account-status']);
  if (!auth.needsProfileCompletion()) return router.createUrlTree(['/profile']);
  return true;
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    await auth.ensureInitialized();
  } catch {
    return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  }
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
  if (auth.needsProfileCompletion()) return router.createUrlTree(['/auth/complete-profile']);
  return auth.isAdmin() ? true : router.createUrlTree(['/']);
};
