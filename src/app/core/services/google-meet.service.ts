import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

interface GoogleMeetStatus {
  connected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class GoogleMeetService {
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);
  private statusSignal = signal<GoogleMeetStatus>({ connected: false, googleEmail: null, connectedAt: null });
  private loadingSignal = signal(false);
  private busySignal = signal(false);

  readonly status = this.statusSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly isBusy = this.busySignal.asReadonly();

  async loadStatus(): Promise<void> {
    if (!this.supabase.client) return;
    this.loadingSignal.set(true);
    try {
      const { data, error } = await this.supabase.requireClient().functions.invoke('google-meet-oauth', { body: { action: 'status' } });
      if (error) throw error;
      this.statusSignal.set({
        connected: Boolean(data?.connected),
        googleEmail: data?.googleEmail ?? null,
        connectedAt: data?.connectedAt ?? null
      });
    } catch {
      this.toast.danger('No se pudo consultar la conexión de Google Meet.');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async connect(): Promise<void> {
    if (this.busySignal()) return;
    this.busySignal.set(true);
    try {
      const { data, error } = await this.supabase.requireClient().functions.invoke('google-meet-oauth', { body: { action: 'start' } });
      if (error) throw error;
      if (!data?.authUrl || typeof data.authUrl !== 'string') throw new Error('No se recibió la URL de autorización de Google.');
      window.location.assign(data.authUrl);
    } catch (error) {
      this.toast.danger(await this.functionError(error, 'No se pudo iniciar la conexión con Google Meet.'));
      this.busySignal.set(false);
    }
  }

  async disconnect(): Promise<void> {
    if (this.busySignal()) return;
    this.busySignal.set(true);
    try {
      const { error } = await this.supabase.requireClient().functions.invoke('google-meet-oauth', { body: { action: 'disconnect' } });
      if (error) throw error;
      this.statusSignal.set({ connected: false, googleEmail: null, connectedAt: null });
      this.toast.success('Se desconectó la cuenta de Google Meet.');
    } catch (error) {
      this.toast.danger(await this.functionError(error, 'No se pudo desconectar Google Meet.'));
    } finally {
      this.busySignal.set(false);
    }
  }

  private async functionError(error: unknown, fallback: string): Promise<string> {
    if (error && typeof error === 'object' && 'context' in error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const payload = await context.clone().json().catch(() => ({})) as { error?: string };
        return payload.error ?? fallback;
      }
    }
    return error instanceof Error ? error.message : fallback;
  }
}
