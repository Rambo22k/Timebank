import { Injectable, computed, effect, signal, inject } from '@angular/core';
import { AppNotification, NotificationRow } from '../models/notification.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);

  private readonly notificationsSignal = signal<AppNotification[]>([]);
  private readonly loadingSignal = signal(false);
  readonly notifications = this.notificationsSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly unreadCount = computed(() => this.notificationsSignal().filter(item => !item.readAt).length);

  private activeUserId: string | null = null;
  private loadSequence = 0;

  constructor() {
    effect(onCleanup => {
      const userId = this.auth.authUser()?.id ?? null;
      this.activeUserId = userId;
      this.loadSequence++;

      if (!userId || !this.supabase.client) {
        this.notificationsSignal.set([]);
        this.loadingSignal.set(false);
        return;
      }

      const client = this.supabase.requireClient();
      const channel = client.channel(`notifications:${userId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`
        }, payload => {
          const notification = this.fromRow(payload.new as NotificationRow);
          this.notificationsSignal.update(current => [notification, ...current.filter(item => item.id !== notification.id)].slice(0, 50));
          this.toast.show(notification.title, 'info', 5000);
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`
        }, payload => {
          const notification = this.fromRow(payload.new as NotificationRow);
          this.notificationsSignal.update(current => current.map(item => item.id === notification.id ? notification : item));
        })
        .subscribe();

      const sequence = this.loadSequence;
      void this.load(userId, sequence);
      onCleanup(() => { void client.removeChannel(channel); });
    });
  }

  async refresh(): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (userId) await this.load(userId, this.loadSequence);
  }

  async markRead(id: string): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId) return;
    const readAt = new Date().toISOString();
    const { error } = await this.supabase.requireClient().from('notifications')
      .update({ read_at: readAt }).eq('id', id).eq('user_id', userId).is('read_at', null);
    if (error) {
      this.toast.danger('No se pudo actualizar la notificación. Inténtalo de nuevo.');
      return;
    }
    this.notificationsSignal.update(items => items.map(item => item.id === id ? { ...item, readAt } : item));
  }

  async markAllRead(): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId || !this.unreadCount()) return;
    const readAt = new Date().toISOString();
    const { error } = await this.supabase.requireClient().from('notifications')
      .update({ read_at: readAt }).eq('user_id', userId).is('read_at', null);
    if (error) {
      this.toast.danger('No se pudieron marcar las notificaciones como leídas.');
      return;
    }
    this.notificationsSignal.update(items => items.map(item => item.readAt ? item : { ...item, readAt }));
  }

  private async load(userId: string, sequence: number): Promise<void> {
    this.loadingSignal.set(true);
    const { data, error } = await this.supabase.requireClient().from('notifications')
      .select('id,user_id,notification_type,title,body,data,read_at,created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);

    if (sequence !== this.loadSequence || userId !== this.activeUserId) return;
    if (error) {
      this.loadingSignal.set(false);
      this.toast.warning('No se pudieron cargar las notificaciones.');
      return;
    }
    const loaded = (data as NotificationRow[]).map(row => this.fromRow(row));
    const merged = new Map([...this.notificationsSignal(), ...loaded].map(item => [item.id, item]));
    this.notificationsSignal.set([...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50));
    this.loadingSignal.set(false);
  }

  private fromRow(row: NotificationRow): AppNotification {
    let title = row.title;
    let body = row.body;
    const translations: Record<string, [string, string]> = {
      'New message': ['Nuevo mensaje', 'Recibiste un mensaje nuevo.'],
      'New session request': ['Nueva solicitud de intercambio', 'Recibiste una solicitud para intercambiar una habilidad.'],
      'New proposed session time': ['Nuevo horario propuesto', 'La otra persona propuso un nuevo horario para el intercambio.'],
      'Request accepted': ['Solicitud aceptada', 'La solicitud fue aceptada y la sesión quedó agendada.'],
      'Request declined': ['Solicitud rechazada', 'La otra persona no podrá realizar este intercambio.'],
      'Request expired': ['Solicitud vencida', 'La solicitud venció antes de recibir respuesta.'],
      'Request cancelled': ['Solicitud cancelada', 'La otra persona canceló la solicitud o sesión.'],
      'Exchange under review': ['Intercambio en revisión', 'Se reportó un problema con este intercambio.'],
      'Session confirmed': ['Sesión confirmada', 'La otra persona confirmó que la sesión se realizó.'],
      'New review': ['Nueva reseña', 'Recibiste una reseña después de un intercambio.'],
      'Welcome credits': ['Créditos de bienvenida', 'Se agregaron créditos a tu billetera.'],
      'Exchange completed': ['Intercambio completado', 'La sesión se completó y tus créditos quedaron actualizados.'],
      'Credits refunded': ['Créditos devueltos', 'Los créditos reservados fueron devueltos a tu billetera.'],
      'Donation recorded': ['Donación registrada', 'Tu aporte al fondo solidario quedó registrado.'],
      'Solidarity support received': ['Apoyo solidario recibido', 'Se agregaron créditos de apoyo a tu billetera.'],
      'Solidarity request declined': ['Solicitud solidaria no aprobada', 'Tu solicitud no fue aprobada. Revisa la respuesta del equipo de TimeBank.'],
      'Credit balance updated': ['Actualización de créditos', 'Se actualizó el saldo de tu billetera.']
    };
    const translation = translations[row.title];
    if (translation) [title, body] = translation;
    return {
      id: row.id,
      userId: row.user_id,
      type: row.notification_type,
      title,
      body,
      data: row.data ?? {},
      readAt: row.read_at,
      createdAt: row.created_at
    };
  }
}
