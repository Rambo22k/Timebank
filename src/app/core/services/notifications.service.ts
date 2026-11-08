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
    const translations: Record<string, { es: [string, string]; en: [string, string] }> = {
      'New message': { es: ['Nuevo mensaje', 'Recibiste un mensaje nuevo.'], en: ['New message', 'You received a new message.'] },
      'New session request': { es: ['Nueva solicitud de intercambio', 'Recibiste una solicitud para intercambiar una habilidad.'], en: ['New session request', 'You received a request to exchange a skill.'] },
      'Teaching offer received': { es: ['Te ofrecen enseñar', 'Un miembro te ofreció una sesión para aprender una habilidad que buscas.'], en: ['Teaching offer received', 'A member offered to teach a skill you want to learn.'] },
      'New contact request': { es: ['Nueva solicitud de contacto', 'Alguien quiere conectar contigo.'], en: ['New contact request', 'Someone wants to connect with you.'] },
      'Contact request accepted': { es: ['Solicitud de contacto aceptada', 'Ahora forman parte de los contactos de TimeBank.'], en: ['Contact request accepted', 'You are now connected on TimeBank.'] },
      'New proposed session time': { es: ['Nuevo horario propuesto', 'La otra persona propuso un nuevo horario para el intercambio.'], en: ['New time proposed', 'The other person proposed a new time for the exchange.'] },
      'Request accepted': { es: ['Solicitud aceptada', 'La solicitud fue aceptada y la sesión quedó agendada.'], en: ['Request accepted', 'The request was accepted and the session is scheduled.'] },
      'Request declined': { es: ['Solicitud rechazada', 'La otra persona no podrá realizar este intercambio.'], en: ['Request declined', 'The other person is unable to complete this exchange.'] },
      'Request expired': { es: ['Solicitud vencida', 'La solicitud venció antes de recibir respuesta.'], en: ['Request expired', 'The request expired before receiving a response.'] },
      'Request cancelled': { es: ['Solicitud cancelada', 'La otra persona canceló la solicitud o sesión.'], en: ['Request cancelled', 'The other person cancelled the request or session.'] },
      'Exchange under review': { es: ['Intercambio en revisión', 'Se reportó un problema con este intercambio.'], en: ['Exchange under review', 'A problem was reported with this exchange.'] },
      'Session confirmed': { es: ['Sesión confirmada', 'La otra persona confirmó que la sesión se realizó.'], en: ['Session confirmed', 'The other person confirmed the session took place.'] },
      'New review': { es: ['Nueva reseña', 'Recibiste una reseña después de un intercambio.'], en: ['New review', 'You received a review after an exchange.'] },
      'Welcome credits': { es: ['Créditos de bienvenida', 'Se agregaron créditos a tu billetera.'], en: ['Welcome credits', 'Credits were added to your wallet.'] },
      'Exchange completed': { es: ['Intercambio completado', 'La sesión se completó y tus créditos quedaron actualizados.'], en: ['Exchange completed', 'The session was completed and your credits were updated.'] },
      'Credits refunded': { es: ['Créditos devueltos', 'Los créditos reservados fueron devueltos a tu billetera.'], en: ['Credits refunded', 'Reserved credits were returned to your wallet.'] },
      'Donation recorded': { es: ['Donación registrada', 'Tu aporte al fondo solidario quedó registrado.'], en: ['Donation recorded', 'Your contribution to the solidarity fund was recorded.'] },
      'Solidarity support received': { es: ['Apoyo solidario recibido', 'Se agregaron créditos de apoyo a tu billetera.'], en: ['Solidarity support received', 'Support credits were added to your wallet.'] },
      'Solidarity request declined': { es: ['Solicitud solidaria no aprobada', 'Tu solicitud no fue aprobada. Revisa la respuesta del equipo de TimeBank.'], en: ['Solidarity request declined', 'Your request was not approved. Review the TimeBank team response.'] },
      'Credit balance updated': { es: ['Actualización de créditos', 'Se actualizó el saldo de tu billetera.'], en: ['Credit balance updated', 'Your wallet balance was updated.'] }
    };
    const translation = translations[row.title];
    if (translation) [title, body] = translation[this.auth.currentUser()?.preferredLanguage ?? 'es'];
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
