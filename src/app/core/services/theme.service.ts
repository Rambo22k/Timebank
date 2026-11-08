import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export type ThemePreference = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly auth = inject(AuthService);
  private readonly preferenceSignal = signal<ThemePreference>('system');
  private readonly systemDark = signal(false);
  readonly preference = this.preferenceSignal.asReadonly();
  readonly isDark = computed(() => this.preferenceSignal() === 'dark'
    || (this.preferenceSignal() === 'system' && this.systemDark()));

  constructor() {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemDark.set(media.matches);
      media.addEventListener('change', event => this.systemDark.set(event.matches));
    }
    effect(() => {
      const accountPreference = this.auth.currentUser()?.preferredTheme;
      const savedPreference = this.readLocalPreference();
      this.preferenceSignal.set(accountPreference ?? savedPreference);
      this.applyTheme();
    });
  }

  async toggle(): Promise<void> {
    const next: ThemePreference = this.isDark() ? 'light' : 'dark';
    this.preferenceSignal.set(next);
    this.writeLocalPreference(next);
    this.applyTheme();
    if (this.auth.authUser()) await this.auth.updateThemePreference(next);
  }

  private applyTheme(): void {
    if (typeof document === 'undefined') return;
    const dark = this.isDark();
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }

  private readLocalPreference(): ThemePreference {
    try {
      const value = localStorage.getItem('timebank.theme');
      return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
    } catch { return 'system'; }
  }

  private writeLocalPreference(value: ThemePreference): void {
    try { localStorage.setItem('timebank.theme', value); } catch { /* Browser storage may be disabled. */ }
  }
}
