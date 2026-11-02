import { Injectable, computed, effect, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { CreditActivity, ExchangeRequest, ExchangeReview, ExchangeSession } from '../models/exchange.model';
import { MOCK_USERS } from '../mock-data/users.mock';
import { SupabaseService } from './supabase.service';

interface RequestRow {
  id: string;
  requester_id: string;
  provider_id: string;
  skill_id: string;
  message: string;
  proposed_start_at: string;
  requested_hours: number;
  status: ExchangeRequest['status'];
  created_at: string;
}

interface RequestProfileRow {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

interface RequestSkillRow {
  id: string;
  title: string;
}

const DEMO_REQUESTS: ExchangeRequest[] = [
  {
    id: 'request-demo-1', requesterId: 'user-elena', requesterName: 'Elena Vance',
    requesterAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    providerId: 'user-enyel', providerName: 'Enyel Reyes',
    providerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    skillId: 'skill-1', skillTitle: 'Arquitectura Frontend con Angular, Ionic y TypeScript',
    message: 'Me gustaría revisar la estructura de mi aplicación y entender mejor cómo organizar los servicios.',
    proposedStartAt: '2026-11-06T15:00:00', requestedHours: 1, status: 'pending', createdAt: '2026-11-01T13:20:00'
  },
  {
    id: 'request-demo-2', requesterId: 'user-enyel', requesterName: 'Enyel Reyes',
    requesterAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    providerId: 'user-carlos', providerName: 'Carlos Mendoza',
    providerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    skillId: 'skill-7', skillTitle: 'Guitarra: técnica, acordes y ritmo',
    message: 'Quiero aprender algunos acordes para principiantes. ¿Te viene bien una sesión online?',
    proposedStartAt: '2026-11-08T17:00:00', requestedHours: 1, status: 'accepted', createdAt: '2026-10-30T10:15:00'
  },
  {
    id: 'request-demo-3', requesterId: 'user-sofia', requesterName: 'Sofía Alarcón',
    requesterAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    providerId: 'user-enyel', providerName: 'Enyel Reyes',
    providerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    skillId: 'skill-2', skillTitle: 'Diseño UI/UX con Enfoque Minimalista',
    message: '¿Podríamos mover la sesión al sábado por la mañana?',
    proposedStartAt: '2026-11-04T16:00:00', requestedHours: 1.5, status: 'pending', createdAt: '2026-10-31T09:00:00'
  }
];

const DEMO_SESSIONS: ExchangeSession[] = [
  { id: 'session-demo-1', requestId: 'request-demo-2', requesterId: 'user-enyel', providerId: 'user-carlos', partnerId: 'user-carlos', partnerName: 'Carlos Mendoza', partnerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80', skillTitle: 'Guitarra: técnica, acordes y ritmo', startAt: '2026-11-08T17:00:00', hours: 1, status: 'scheduled', requesterConfirmed: false, providerConfirmed: false, reviewSubmitted: false },
  { id: 'session-demo-2', requestId: 'request-demo-old', requesterId: 'user-elena', providerId: 'user-enyel', partnerId: 'user-elena', partnerName: 'Elena Vance', partnerAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80', skillTitle: 'Fundamentos de Python para principiantes', startAt: '2026-10-28T14:00:00', hours: 1, status: 'completed', requesterConfirmed: true, providerConfirmed: true, reviewSubmitted: false },
  { id: 'session-demo-3', requestId: 'request-demo-old-2', requesterId: 'user-enyel', providerId: 'user-sofia', partnerId: 'user-sofia', partnerName: 'Sofía Alarcón', partnerAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80', skillTitle: 'Design Systems en Figma', startAt: '2026-10-20T16:00:00', hours: 1.5, status: 'completed', requesterConfirmed: true, providerConfirmed: true, reviewSubmitted: true },
  { id: 'session-demo-4', requestId: 'request-demo-old-3', requesterId: 'user-carlos', providerId: 'user-enyel', partnerId: 'user-carlos', partnerName: 'Carlos Mendoza', partnerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80', skillTitle: 'Introducción a Ionic', startAt: '2026-10-31T12:00:00', hours: 1, status: 'awaiting_confirmation', requesterConfirmed: true, providerConfirmed: false, reviewSubmitted: false }
];

const DEMO_ACTIVITY: CreditActivity[] = [
  { id: 'tx-demo-1', title: 'Créditos de bienvenida', detail: 'Saldo inicial de TimeBank', date: '2026-10-24T09:00:00', amount: 5, type: 'welcome' },
  { id: 'tx-demo-2', title: 'Sesión impartida', detail: 'Introducción a TypeScript · Elena Vance', date: '2026-10-28T15:00:00', amount: 1, type: 'earned' },
  { id: 'tx-demo-3', title: 'Sesión recibida', detail: 'Design Systems en Figma · Sofía Alarcón', date: '2026-10-20T17:30:00', amount: -1, type: 'spent' }
];

const DEMO_REVIEWS: ExchangeReview[] = [
  { id: 'review-demo-1', sessionId: 'session-demo-old', authorId: 'user-elena', authorName: 'Elena Vance', authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80', recipientId: 'user-enyel', recipientName: 'Enyel Reyes', skillTitle: 'Introducción a TypeScript', rating: 5, comment: 'Explicó los conceptos con mucha claridad y adaptó la sesión a mis dudas. ¡Muy recomendable!', createdAt: '2026-10-28T16:00:00' }
];

@Injectable({ providedIn: 'root' })
export class ExchangeService {
  private requestsSignal = signal<ExchangeRequest[]>([]);
  private requestsLoadingSignal = signal(false);
  private requestsLoadVersion = 0;
  private sessionsSignal = signal([...DEMO_SESSIONS]);
  private activitySignal = signal([...DEMO_ACTIVITY]);
  private reviewsSignal = signal([...DEMO_REVIEWS]);
  private reservedRequestIds = new Set<string>();

  readonly requests = this.requestsSignal.asReadonly();
  readonly isLoadingRequests = this.requestsLoadingSignal.asReadonly();
  readonly sessions = this.sessionsSignal.asReadonly();
  readonly activity = this.activitySignal.asReadonly();
  readonly reviews = this.reviewsSignal.asReadonly();
  readonly balance = computed(() => this.auth.currentUser()?.timeCredits ?? 0);

  constructor(private auth: AuthService, private toast: ToastService, private supabase: SupabaseService) {
    effect(() => {
      this.auth.authUser()?.id;
      void this.loadRequests();
    });
  }

  get currentUserId(): string { return this.auth.authUser()?.id ?? ''; }
  requestsFor(direction: 'incoming' | 'outgoing'): ExchangeRequest[] {
    return this.requestsSignal().filter(r => direction === 'incoming' ? r.providerId === this.currentUserId : r.requesterId === this.currentUserId);
  }
  sessionsForCurrentUser(): ExchangeSession[] {
    return this.sessionsSignal().filter(s => s.requesterId === this.currentUserId || s.providerId === this.currentUserId);
  }
  hasCurrentUserConfirmed(session: ExchangeSession): boolean {
    return session.requesterId === this.currentUserId ? session.requesterConfirmed : session.providerConfirmed;
  }
  canConfirmSession(session: ExchangeSession): boolean {
    return session.status !== 'completed' && !this.hasCurrentUserConfirmed(session) && new Date(session.startAt) <= new Date();
  }
  partnerFor(session: ExchangeSession): { name: string; avatar: string } {
    const partnerId = session.requesterId === this.currentUserId ? session.providerId : session.requesterId;
    const user = MOCK_USERS.find(item => item.id === partnerId);
    if (user) return { name: user.name, avatar: user.avatar };
    return { name: session.partnerName, avatar: session.partnerAvatar };
  }
  pendingReviews(): ExchangeSession[] {
    return this.sessionsForCurrentUser().filter(s => s.status === 'completed' && !s.reviewSubmitted);
  }
  reviewsForCurrentUser(): ExchangeReview[] {
    return this.reviewsSignal().filter(r => r.recipientId === this.currentUserId);
  }

  async loadRequests(): Promise<void> {
    const version = ++this.requestsLoadVersion;
    const userId = this.auth.authUser()?.id;
    const client = this.supabase.client;
    if (!userId || !client) {
      this.requestsSignal.set([]);
      this.requestsLoadingSignal.set(false);
      return;
    }

    this.requestsSignal.set([]);
    this.requestsLoadingSignal.set(true);
    try {
      const { data, error } = await client.from('session_requests')
        .select('id, requester_id, provider_id, skill_id, message, proposed_start_at, requested_hours, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as RequestRow[];
      const profileIds = [...new Set(rows.flatMap(row => [row.requester_id, row.provider_id]))];
      const skillIds = [...new Set(rows.map(row => row.skill_id))];
      let profileRows: RequestProfileRow[] = [];
      let skillRows: RequestSkillRow[] = [];
      if (profileIds.length) {
        const result = await client.from('profiles').select('id, display_name, avatar_path').in('id', profileIds);
        if (result.error) throw result.error;
        profileRows = (result.data ?? []) as RequestProfileRow[];
      }
      if (skillIds.length) {
        const result = await client.from('skills').select('id, title').in('id', skillIds);
        if (result.error) throw result.error;
        skillRows = (result.data ?? []) as RequestSkillRow[];
      }
      if (version !== this.requestsLoadVersion) return;
      const profiles = new Map(profileRows.map(profile => [profile.id, profile]));
      const skills = new Map(skillRows.map(skill => [skill.id, skill.title]));
      this.requestsSignal.set(rows.map(row => ({
        id: row.id,
        requesterId: row.requester_id,
        requesterName: profiles.get(row.requester_id)?.display_name ?? 'Miembro de TimeBank',
        requesterAvatar: this.avatarUrl(profiles.get(row.requester_id)?.avatar_path),
        providerId: row.provider_id,
        providerName: profiles.get(row.provider_id)?.display_name ?? 'Miembro de TimeBank',
        providerAvatar: this.avatarUrl(profiles.get(row.provider_id)?.avatar_path),
        skillId: row.skill_id,
        skillTitle: skills.get(row.skill_id) ?? 'Habilidad solicitada',
        message: row.message,
        proposedStartAt: row.proposed_start_at,
        requestedHours: Number(row.requested_hours),
        status: row.status,
        createdAt: row.created_at
      })));
    } catch {
      if (version === this.requestsLoadVersion) this.toast.danger('No se pudieron cargar las solicitudes. Inténtalo de nuevo.');
    } finally {
      if (version === this.requestsLoadVersion) this.requestsLoadingSignal.set(false);
    }
  }

  async createRequest(data: Omit<ExchangeRequest, 'id' | 'status' | 'createdAt' | 'requesterId' | 'requesterName' | 'requesterAvatar'>): Promise<boolean> {
    if (!this.auth.authUser()) {
      this.toast.warning('Inicia sesión para enviar una propuesta.');
      return false;
    }
    try {
      const { error } = await this.supabase.requireClient().rpc('create_session_request', {
        p_provider_id: data.providerId,
        p_skill_id: data.skillId,
        p_message: data.message,
        p_proposed_start_at: data.proposedStartAt,
        p_requested_hours: data.requestedHours
      });
      if (error) throw error;
      await this.loadRequests();
      this.toast.success('Solicitud enviada. Puedes seguirla en Solicitudes.');
      return true;
    } catch (error) {
      this.toast.danger(this.requestErrorMessage(error));
      return false;
    }
  }

  async respondToRequest(id: string, action: 'accept' | 'reject'): Promise<void> {
    const request = this.requestsSignal().find(item => item.id === id);
    if (!request || request.providerId !== this.currentUserId || request.status !== 'pending') return;
    try {
      const { error } = await this.supabase.requireClient().rpc('respond_to_session_request', {
        p_request_id: id,
        p_action: action,
        p_new_start_at: null
      });
      if (error) throw error;
      await this.loadRequests();
      this.toast.success(action === 'accept' ? 'Solicitud aceptada y sesión agendada.' : 'Solicitud rechazada.');
    } catch (error) {
      this.toast.danger(this.requestErrorMessage(error));
    }
  }

  async cancelRequest(id: string): Promise<void> {
    try {
      const { error } = await this.supabase.requireClient().rpc('cancel_session_request', {
        p_request_id: id,
        p_reason: null
      });
      if (error) throw error;
      await this.loadRequests();
      this.toast.info('Solicitud cancelada.');
    } catch (error) {
      this.toast.danger(this.requestErrorMessage(error));
    }
  }

  async rescheduleRequest(id: string, proposedStartAt: string): Promise<void> {
    const request = this.requestsSignal().find(item => item.id === id);
    const startAt = new Date(proposedStartAt);
    if (!request || request.providerId !== this.currentUserId || request.status !== 'pending' || Number.isNaN(startAt.getTime()) || startAt <= new Date()) {
      this.toast.warning('Elige una fecha futura para proponer otro horario.');
      return;
    }
    try {
      const { error } = await this.supabase.requireClient().rpc('respond_to_session_request', {
        p_request_id: id,
        p_action: 'reschedule',
        p_new_start_at: startAt.toISOString()
      });
      if (error) throw error;
      await this.loadRequests();
      this.toast.success('Nuevo horario propuesto. La otra persona debe confirmarlo.');
    } catch (error) {
      this.toast.danger(this.requestErrorMessage(error));
    }
  }

  async acceptRescheduledRequest(id: string): Promise<void> {
    const request = this.requestsSignal().find(item => item.id === id);
    if (!request || request.requesterId !== this.currentUserId || request.status !== 'rescheduled') return;
    try {
      const { error } = await this.supabase.requireClient().rpc('accept_rescheduled_request', { p_request_id: id });
      if (error) throw error;
      await this.loadRequests();
      this.toast.success('Horario aceptado. La sesión ya está agendada.');
    } catch (error) {
      this.toast.danger(this.requestErrorMessage(error));
    }
  }

  cancelSession(id: string): void {
    const session = this.sessionsSignal().find(item => item.id === id);
    const user = this.auth.currentUser();
    this.sessionsSignal.update(items => items.map(item => item.id === id && item.status === 'scheduled' ? { ...item, status: 'cancelled' } : item));
    if (session?.status === 'scheduled') this.requestsSignal.update(items => items.map(item => item.id === session.requestId ? { ...item, status: 'cancelled' } : item));
    if (session && user && session.requesterId === this.currentUserId && session.status === 'scheduled' && this.reservedRequestIds.delete(session.requestId)) {
      this.auth.updateCurrentUserProfile({ timeCredits: user.timeCredits + session.hours }, false);
      this.activitySignal.update(items => [{ id: `tx-${Date.now()}`, title: 'Créditos devueltos', detail: session.skillTitle, date: new Date().toISOString(), amount: session.hours, type: 'refund' }, ...items]);
    }
    this.toast.info('Sesión cancelada.');
  }

  confirmSession(id: string): void {
    const session = this.sessionsSignal().find(item => item.id === id);
    if (!session || session.status === 'completed') return;
    if (new Date(session.startAt) > new Date()) { this.toast.warning('La sesión todavía no ha ocurrido.'); return; }
    const currentIsRequester = session.requesterId === this.currentUserId;
    const requesterConfirmed = session.requesterConfirmed || currentIsRequester;
    const providerConfirmed = session.providerConfirmed || !currentIsRequester;
    const complete = requesterConfirmed && providerConfirmed;
    this.sessionsSignal.update(items => items.map(item => item.id === id ? { ...item, requesterConfirmed, providerConfirmed, status: complete ? 'completed' : 'awaiting_confirmation' } : item));
    if (complete) {
      const current = this.auth.currentUser();
      const earns = session.providerId === this.currentUserId;
      const amount = session.hours * (earns ? 1 : -1);
      if (current && earns) this.auth.updateCurrentUserProfile({ timeCredits: current.timeCredits + amount }, false);
      this.reservedRequestIds.delete(session.requestId);
      this.activitySignal.update(items => [{ id: `tx-${Date.now()}`, title: earns ? 'Créditos por sesión impartida' : 'Créditos por sesión recibida', detail: `${session.skillTitle} · ${session.partnerName}`, date: new Date().toISOString(), amount: earns ? amount : 0, type: earns ? 'earned' : 'spent' }, ...items]);
      this.toast.success('Sesión completada y créditos actualizados.');
    } else {
      this.toast.info('Tu confirmación quedó registrada. Falta la confirmación de la otra persona.');
    }
  }

  openDispute(id: string): void {
    const session = this.sessionsSignal().find(item => item.id === id);
    this.sessionsSignal.update(items => items.map(item => item.id === id ? { ...item, status: 'disputed' } : item));
    if (session) this.requestsSignal.update(items => items.map(item => item.id === session.requestId ? { ...item, status: 'disputed' } : item));
    this.toast.warning('La sesión quedó marcada para revisión.');
  }

  submitReview(sessionId: string, rating: number, comment: string): void {
    const session = this.sessionsSignal().find(item => item.id === sessionId);
    const user = this.auth.currentUser();
    if (!session || !user || rating < 1 || rating > 5 || session.status !== 'completed' || session.reviewSubmitted) return;
    const partner = this.partnerFor(session);
    const partnerId = session.requesterId === this.currentUserId ? session.providerId : session.requesterId;
    this.reviewsSignal.update(items => [{ id: `review-${Date.now()}`, sessionId, authorId: user.id, authorName: user.name, authorAvatar: user.avatar, recipientId: partnerId, recipientName: partner.name, skillTitle: session.skillTitle, rating, comment: comment.trim(), createdAt: new Date().toISOString() }, ...items]);
    this.sessionsSignal.update(items => items.map(item => item.id === sessionId ? { ...item, reviewSubmitted: true } : item));
    this.toast.success('Reseña publicada. Gracias por compartir tu experiencia.');
  }

  private avatarUrl(path: string | null | undefined): string {
    if (!path) return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
    if (/^https?:\/\//i.test(path)) return path;
    return this.supabase.client?.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl ?? '';
  }

  private requestErrorMessage(error: unknown): string {
    const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
    if (message.includes('insufficient available credits')) return 'No tienes créditos suficientes para esa duración.';
    if (message.includes('confirm your email')) return 'Confirma tu correo antes de enviar una solicitud.';
    if (message.includes('complete your age and policy acceptance')) return 'Completa tu fecha de nacimiento y acepta las políticas para continuar.';
    if (message.includes('future date') || message.includes('proposed date')) return 'Elige una fecha futura para la sesión.';
    if (message.includes('request is no longer pending')) return 'Esta solicitud ya recibió una respuesta.';
    return 'No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.';
  }
}
