import { Injectable, computed, signal, inject } from '@angular/core';
import { AuthError, User } from '@supabase/supabase-js';
import { UserProfile } from '../models/user.model';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
  birthDate: string;
  countryCode: string;
  timezone: string;
  preferredLanguage: 'en' | 'es';
}

interface PrivateProfile {
  birth_date: string | null;
  accepted_terms_at: string | null;
  accepted_privacy_at: string | null;
  preferred_language: 'en' | 'es';
  account_status: 'active' | 'suspended' | 'deactivated';
  suspension_reason: string | null;
}

export class TimeBankAuthError extends Error {
  constructor(message: string, readonly originalError?: AuthError) {
    super(message);
    this.name = 'TimeBankAuthError';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);
  private toastService = inject(ToastService);

  private currentUserSignal = signal<UserProfile | null>(null);
  private authUserSignal = signal<User | null>(null);
  private privateProfileSignal = signal<PrivateProfile | null>(null);
  private isAdminSignal = signal(false);
  private initializedPromise: Promise<void> | null = null;

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly authUser = this.authUserSignal.asReadonly();
  readonly isAdmin = this.isAdminSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.authUserSignal() !== null);
  readonly accountStatus = computed(() => this.privateProfileSignal()?.account_status ?? 'active');
  readonly suspensionReason = computed(() => this.privateProfileSignal()?.suspension_reason ?? null);
  readonly isReady = signal(false);
  readonly needsProfileCompletion = computed(() => {
    if (!this.isAuthenticated()) return false;
    const profile = this.privateProfileSignal();
    return !profile?.birth_date || !profile.accepted_terms_at || !profile.accepted_privacy_at;
  });
  readonly isPasswordRecovery = signal(false);

  constructor() {
    if (this.supabase.client) {
      this.supabase.client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          this.clearSession();
          return;
        }
        if (event === 'PASSWORD_RECOVERY') this.isPasswordRecovery.set(true);
        queueMicrotask(() => void this.loadAuthenticatedUser(session.user).catch(error => this.toastService.danger(this.messageFor(error))));
      });
    } else {
      this.isReady.set(true);
    }
    void this.ensureInitialized().catch(error => this.toastService.danger(this.messageFor(error)));
  }

  ensureInitialized(): Promise<void> {
    if (!this.initializedPromise) this.initializedPromise = this.restoreSession();
    return this.initializedPromise;
  }

  private async restoreSession(): Promise<void> {
    if (!this.supabase.client) { this.isReady.set(true); return; }
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      if (error) throw error;
      if (data.session?.user) await this.loadAuthenticatedUser(data.session.user);
    } catch (error) {
      this.clearSession();
      throw new TimeBankAuthError(this.messageFor(error), error as AuthError);
    } finally {
      this.isReady.set(true);
    }
  }

  async login(email: string, password: string): Promise<void> {
    await this.ensureInitialized();
    const client = this.supabase.requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
    if (data.user) await this.loadAuthenticatedUser(data.user);
    this.toastService.success(`¡Bienvenido${this.currentUser()?.name ? `, ${this.currentUser()?.name}` : ''}!`);
  }

  async register(credentials: RegisterCredentials): Promise<{ emailConfirmationRequired: boolean }> {
    await this.ensureInitialized();
    const acceptedAt = new Date().toISOString();
    const { data, error } = await this.supabase.requireClient().auth.signUp({
      email: credentials.email.trim(),
      password: credentials.password,
      options: {
        emailRedirectTo: this.redirectUrl('/auth/callback'),
        data: {
          full_name: credentials.name.trim(),
          birth_date: credentials.birthDate,
          country_code: credentials.countryCode.toUpperCase(),
          timezone: credentials.timezone,
          preferred_language: credentials.preferredLanguage,
          accepted_terms_at: acceptedAt,
          accepted_privacy_at: acceptedAt
        }
      }
    });
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
    if (data.session && data.user) await this.loadAuthenticatedUser(data.user);
    return { emailConfirmationRequired: !data.session };
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.supabase.requireClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: this.redirectUrl('/auth/callback') }
    });
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
  }

  async resendSignupConfirmation(email: string): Promise<void> {
    const { error } = await this.supabase.requireClient().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: this.redirectUrl('/auth/callback') }
    });
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
    this.toastService.info('Si el correo puede recibir una confirmación, recibirás un nuevo mensaje en tu bandeja de entrada.');
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.supabase.requireClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: this.redirectUrl('/auth/update-password')
    });
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.supabase.requireClient().auth.updateUser({ password });
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
    this.isPasswordRecovery.set(false);
    this.toastService.success('Tu contraseña se actualizó.');
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.authUserSignal();
    if (!user?.email) throw new TimeBankAuthError('No se pudo verificar el correo de esta cuenta.');
    const client = this.supabase.requireClient();
    const { data, error: verificationError } = await client.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });
    if (verificationError) {
      if (verificationError.message.toLowerCase().includes('invalid login credentials')) {
        throw new TimeBankAuthError('La contraseña actual no es correcta.', verificationError);
      }
      throw new TimeBankAuthError(this.messageFor(verificationError), verificationError);
    }
    if (data.user?.id !== user.id) throw new TimeBankAuthError('No se pudo verificar la cuenta actual.');

    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
    await this.reloadAuthenticatedUser();
    this.toastService.success('Tu contraseña se actualizó.');
  }

  async completeOnboarding(birthDate: string): Promise<void> {
    const userId = this.authUserSignal()?.id;
    if (!userId) throw new TimeBankAuthError('Inicia sesión para completar tu perfil.');
    const acceptedAt = new Date().toISOString();
    const { error } = await this.supabase.requireClient()
      .from('profile_private')
      .update({ birth_date: birthDate, accepted_terms_at: acceptedAt, accepted_privacy_at: acceptedAt })
      .eq('user_id', userId);
    if (error) throw new TimeBankAuthError(this.messageFor(error));
    await this.reloadAuthenticatedUser();
  }

  async logout(): Promise<void> {
    const { error } = await this.supabase.requireClient().auth.signOut();
    if (error) throw new TimeBankAuthError(this.messageFor(error), error);
    this.clearSession();
    this.toastService.info('Has cerrado sesión.');
  }

  async reloadAuthenticatedUser(): Promise<void> {
    const user = this.authUserSignal();
    if (user) await this.loadAuthenticatedUser(user);
  }

  async updateLanguagePreference(language: 'en' | 'es'): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('update_my_language_preference', { p_preferred_language: language });
    if (error) throw new TimeBankAuthError(this.messageFor(error));
    await this.reloadAuthenticatedUser();
  }

  async updateCurrentUserProfile(updates: Partial<UserProfile>, notify = true, avatarFile?: File): Promise<void> {
    const current = this.currentUserSignal();
    const userId = this.authUserSignal()?.id;
    if (!current || !userId) return;

    const client = this.supabase.requireClient();

    let uploadedAvatarPath: string | null = null;
    if (avatarFile) {
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const extension = extensions[avatarFile.type];
      if (!extension || avatarFile.size > 5 * 1024 * 1024) {
        throw new TimeBankAuthError('La foto debe ser JPG, PNG o WebP y no superar los 5 MB.');
      }
      uploadedAvatarPath = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await client.storage.from('profile-avatars').upload(uploadedAvatarPath, avatarFile, {
        cacheControl: '3600',
        contentType: avatarFile.type,
        upsert: false
      });
      if (error) throw new TimeBankAuthError(this.messageFor(error));
    }

    const avatarPath = uploadedAvatarPath ?? (updates.avatar !== undefined && updates.avatar !== current.avatar ? updates.avatar : null);
    const { error } = await client.rpc('update_my_profile_settings', {
      p_display_name: (updates.name ?? current.name).trim(),
      p_headline: (updates.headline ?? current.headline).trim(),
      p_location: (updates.location ?? current.location).trim(),
      p_avatar_path: avatarPath,
      p_bio: (updates.bio ?? current.bio).trim(),
      p_country_code: (updates.countryCode ?? current.countryCode).toUpperCase(),
      p_timezone: updates.timezone ?? current.timezone,
      p_preferred_language: updates.preferredLanguage ?? current.preferredLanguage,
      p_language_codes: updates.languages ?? current.languages
    });
    if (error) {
      if (uploadedAvatarPath) await client.storage.from('profile-avatars').remove([uploadedAvatarPath]);
      throw new TimeBankAuthError(this.messageFor(error));
    }
    await this.reloadAuthenticatedUser();
    if (notify) this.toastService.success('Perfil actualizado.');
  }

  private async loadAuthenticatedUser(authUser: User): Promise<void> {
    this.authUserSignal.set(authUser);
    const client = this.supabase.requireClient();
    const [profileResult, privateResult, accountResult, roleResult, languagesResult] = await Promise.all([
      client.from('profiles').select('display_name, headline, location, avatar_path, bio, country_code, timezone, reputation_average, reputation_count, offered_hours, received_hours, completed_sessions, created_at, is_verified').eq('id', authUser.id).maybeSingle(),
      client.from('profile_private').select('birth_date, accepted_terms_at, accepted_privacy_at, preferred_language, account_status, suspension_reason').eq('user_id', authUser.id).maybeSingle(),
      client.from('credit_accounts').select('available_balance').eq('user_id', authUser.id).maybeSingle(),
      client.from('user_roles').select('role').eq('user_id', authUser.id).eq('role', 'admin').maybeSingle(),
      client.from('profile_languages').select('language_code').eq('user_id', authUser.id)
    ]);
    if (profileResult.error) throw new TimeBankAuthError(this.messageFor(profileResult.error));
    if (privateResult.error) throw new TimeBankAuthError(this.messageFor(privateResult.error));
    if (accountResult.error) throw new TimeBankAuthError(this.messageFor(accountResult.error));
    if (roleResult.error) throw new TimeBankAuthError(this.messageFor(roleResult.error));
    if (languagesResult.error) throw new TimeBankAuthError(this.messageFor(languagesResult.error));
    this.isAdminSignal.set(roleResult.data?.role === 'admin');

    const profile = profileResult.data;
    const privateProfile = privateResult.data as PrivateProfile | null;
    const preferredLanguage = privateProfile?.preferred_language ?? 'es';
    this.privateProfileSignal.set(privateProfile);
    const name = profile?.display_name || String(authUser.user_metadata?.['full_name'] ?? authUser.user_metadata?.['name'] ?? authUser.email?.split('@')[0] ?? 'Miembro TimeBank');
    const avatarPath = profile?.avatar_path;
    const avatar = avatarPath
      ? /^https?:\/\//i.test(avatarPath) ? avatarPath : client.storage.from('profile-avatars').getPublicUrl(avatarPath).data.publicUrl
      : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80';
    const memberSince = profile?.created_at
      ? new Intl.DateTimeFormat(preferredLanguage === 'en' ? 'en-US' : 'es-DO', { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))
      : '';
    const userProfile: UserProfile = {
      id: authUser.id,
      name,
      email: authUser.email ?? '',
      headline: profile?.headline ?? 'Miembro de la comunidad TimeBank',
      bio: profile?.bio ?? '',
      avatar,
      location: profile?.location ?? profile?.country_code ?? 'En línea',
      countryCode: String(profile?.country_code ?? '').trim().toUpperCase(),
      timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
      languages: (languagesResult.data ?? []).map(row => row.language_code as string),
      preferredLanguage,
      timeCredits: Number(accountResult.data?.available_balance ?? 0),
      hoursGiven: Number(profile?.offered_hours ?? 0),
      hoursReceived: Number(profile?.received_hours ?? 0),
      completedExchanges: Number(profile?.completed_sessions ?? 0),
      memberSince,
      rating: Number(profile?.reputation_average ?? 0),
      reviewsCount: Number(profile?.reputation_count ?? 0),
      badges: profile?.is_verified ? ['Miembro verificado'] : [],
      isVerified: profile?.is_verified ?? false
    };
    this.currentUserSignal.set(userProfile);
    this.isReady.set(true);
  }

  private clearSession(): void {
    this.authUserSignal.set(null);
    this.isAdminSignal.set(false);
    this.currentUserSignal.set(null);
    this.privateProfileSignal.set(null);
    this.isPasswordRecovery.set(false);
  }

  private redirectUrl(path: string): string {
    return `${window.location.origin}${path}`;
  }

  private messageFor(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();
    if (normalized.includes('el servicio de acceso no está disponible') || normalized.includes('supabase aún no está configurado')) {
      return 'El servicio de acceso no está disponible. Inténtalo de nuevo más tarde.';
    }
    if (normalized.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (normalized.includes('email not confirmed')) return 'Confirma tu correo desde el enlace que te enviamos antes de iniciar sesión.';
    if (normalized.includes('user already registered')) return 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.';
    if (normalized.includes('password should be at least')) return 'La contraseña no cumple los requisitos mínimos.';
    if (normalized.includes('rate limit')) return 'Se hicieron demasiados intentos. Espera un momento y vuelve a probar.';
    return 'No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.';
  }
}
