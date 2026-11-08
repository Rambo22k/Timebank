import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

export interface AvailabilitySlot {
  id: string;
  user_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  timezone: string;
  is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private loadVersion = 0;

  readonly slots = signal<AvailabilitySlot[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  async load(userId: string): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.requireClient().from('availability')
        .select('id,user_id,weekday,start_time,end_time,timezone,is_active')
        .eq('user_id', userId).eq('is_active', true)
        .order('weekday').order('start_time');
      if (error) throw error;
      if (version === this.loadVersion) this.slots.set((data ?? []) as AvailabilitySlot[]);
    } catch {
      if (version === this.loadVersion) {
        this.slots.set([]);
        this.toast.danger('No se pudo cargar la disponibilidad semanal.');
      }
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }

  async addSlot(weekday: number, startTime: string, endTime: string, timezone: string): Promise<boolean> {
    const userId = this.auth.authUser()?.id;
    const normalizedTimezone = timezone.trim();
    if (!userId) { this.toast.warning('Inicia sesión para guardar tu disponibilidad.'); return false; }
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !startTime || !endTime || startTime >= endTime) {
      this.toast.warning('Elige un día y un intervalo horario válido.');
      return false;
    }
    try { new Intl.DateTimeFormat('en-US', { timeZone: normalizedTimezone }); }
    catch { this.toast.warning('Escribe una zona horaria IANA válida, por ejemplo America/Santo_Domingo.'); return false; }

    this.saving.set(true);
    try {
      const { error } = await this.supabase.requireClient().rpc('add_availability_slot', {
        p_weekday: weekday,
        p_start_time: `${startTime}:00`,
        p_end_time: `${endTime}:00`,
        p_timezone: normalizedTimezone
      });
      if (error) throw error;
      this.toast.success('Horario agregado a tu disponibilidad.');
      await this.load(userId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('overlaps an existing slot')) {
        this.toast.warning('Ese horario se cruza con otra franja del mismo día.');
      } else if (message.includes('timezone')) {
        this.toast.warning('La zona horaria indicada no es válida.');
      } else if (message.includes('active account')) {
        this.toast.warning('La cuenta debe estar activa para cambiar su disponibilidad.');
      } else {
        this.toast.danger('No se pudo guardar el horario. Inténtalo de nuevo.');
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async removeSlot(slotId: string): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId) return;
    this.saving.set(true);
    try {
      const { error } = await this.supabase.requireClient().rpc('remove_availability_slot', { p_slot_id: slotId });
      if (error) throw error;
      this.toast.success('Horario eliminado.');
      await this.load(userId);
    } catch {
      this.toast.danger('No se pudo eliminar el horario. Inténtalo de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }
}
