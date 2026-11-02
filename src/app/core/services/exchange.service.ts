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

interface SessionRow {
  id: string;
  request_id: string;
  scheduled_start_at: string;
  meeting_url: string;
  duration_hours: number;
  status: ExchangeSession['status'];
  requester_confirmed_at: string | null;
  provider_confirmed_at: string | null;
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

const DEMO_ACTIVITY: CreditActivity[] = [
  { id: 'tx-demo-1', title: 'Créditos de bienvenida', detail: 'Saldo inicial de TimeBank', date: '2026-10-24T09:00:00', amount: 5, type: 'welcome' },
  { id: 'tx-demo-2', title: 'Sesión impartida', detail: 'Introducción a TypeScript · Elena Vance', date: '2026-10-28T15:00:00', amount: 1, type: 'earned' },
  { id: 'tx-demo-3', title: 'Sesión recibida', detail: 'Design Systems en Figma · Sofía Alarcón', date: '2026-10-20T17:30:00', amount: -1, type: 'spent' }
];

@Injectable({ providedIn: 'root' })
export class ExchangeService {
  private requestsSignal = signal<ExchangeRequest[]>([]);
  private requestsLoadingSignal = signal(false);
  private requestsLoadVersion = 0;
  private sessionsSignal = signal<ExchangeSession[]>([]);
  private sessionActionsSignal = signal<Set<string>>(new Set());
  private activitySignal = signal([...DEMO_ACTIVITY]);
  private reviewsSignal = signal<ExchangeReview[]>([]);

  readonly requests = this.requestsSignal.asReadonly();
  readonly isLoadingRequests = this.requestsLoadingSignal.asReadonly();
  readonly sessions = this.sessionsSignal.asReadonly();
  readonly sessionActions = this.sessionActionsSignal.asReadonly();
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
    const endAt = new Date(new Date(session.startAt).getTime() + session.hours * 60 * 60 * 1000);
    return (session.status === 'scheduled' || session.status === 'awaiting_confirmation')
      && !this.hasCurrentUserConfirmed(session) && endAt <= new Date();
  }
  isSessionActionPending(sessionId: string): boolean { return this.sessionActionsSignal().has(sessionId); }
  canCancelSession(session: ExchangeSession): boolean {
    return session.status === 'scheduled' && new Date(session.startAt) > new Date();
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
      this.sessionsSignal.set([]);
      this.reviewsSignal.set([]);
      this.requestsLoadingSignal.set(false);
      return;
    }

    this.requestsSignal.set([]);
    this.sessionsSignal.set([]);
    this.reviewsSignal.set([]);
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
      const { data: sessionData, error: sessionError } = await client.from('sessions')
        .select('id,request_id,scheduled_start_at,meeting_url,duration_hours,status,requester_confirmed_at,provider_confirmed_at')
        .order('scheduled_start_at', { ascending: true });
      if (sessionError) throw sessionError;
      const sessionRows = (sessionData ?? []) as SessionRow[];
      const sessionIds = sessionRows.map(row => row.id);
      let reviewedSessionIds = new Set<string>();
      if (sessionIds.length) {
        const { data: reviewData, error: reviewError } = await client.from('reviews')
          .select('session_id').eq('author_id', userId).in('session_id', sessionIds);
        if (reviewError) throw reviewError;
        reviewedSessionIds = new Set((reviewData ?? []).map(row => row.session_id as string));
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
      const requestsById = new Map(rows.map(row => [row.id, row]));
      this.sessionsSignal.set(sessionRows.flatMap(row => {
        const request = requestsById.get(row.request_id);
        if (!request) return [];
        const partnerId = request.requester_id === userId ? request.provider_id : request.requester_id;
        const partner = profiles.get(partnerId);
        return [{
          id: row.id,
          requestId: row.request_id,
          requesterId: request.requester_id,
          providerId: request.provider_id,
          partnerId,
          partnerName: partner?.display_name ?? 'Miembro de TimeBank',
          partnerAvatar: this.avatarUrl(partner?.avatar_path),
          skillTitle: skills.get(request.skill_id) ?? 'Habilidad solicitada',
          startAt: row.scheduled_start_at,
          meetingUrl: row.meeting_url,
          hours: Number(row.duration_hours),
          status: row.status,
          requesterConfirmed: Boolean(row.requester_confirmed_at),
          providerConfirmed: Boolean(row.provider_confirmed_at),
          reviewSubmitted: reviewedSessionIds.has(row.id)
        }];
      }));
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

  async cancelSession(id: string): Promise<void> {
    const session = this.sessionsSignal().find(item => item.id === id);
    if (!session || !this.canCancelSession(session) || this.isSessionActionPending(id)) return;
    await this.withSessionAction(id, async () => {
      const { error } = await this.supabase.requireClient().rpc('cancel_session_request', {
        p_request_id: session.requestId,
        p_reason: 'Cancelled by a session participant'
      });
      if (error) throw error;
      await Promise.all([this.loadRequests(), this.auth.reloadAuthenticatedUser()]);
      this.toast.info('Sesión cancelada y créditos liberados.');
    });
  }

  async confirmSession(id: string): Promise<void> {
    const session = this.sessionsSignal().find(item => item.id === id);
    if (!session || !this.canConfirmSession(session) || this.isSessionActionPending(id)) return;
    await this.withSessionAction(id, async () => {
      const { data, error } = await this.supabase.requireClient().rpc('confirm_session', { p_session_id: id });
      if (error) throw error;
      await Promise.all([this.loadRequests(), this.auth.reloadAuthenticatedUser()]);
      this.toast.info(data === 'completed'
        ? 'Ambas personas confirmaron la sesión. Los créditos fueron liquidados.'
        : 'Tu confirmación quedó registrada. Falta la confirmación de la otra persona.');
    });
  }

  async openDispute(id: string): Promise<void> {
    const session = this.sessionsSignal().find(item => item.id === id);
    if (!session || (session.status !== 'scheduled' && session.status !== 'awaiting_confirmation') || this.isSessionActionPending(id)) return;
    const reason = window.prompt('Describe brevemente el problema (mínimo 5 caracteres):')?.trim();
    if (!reason) return;
    if (reason.length < 5) { this.toast.warning('Describe el problema con al menos 5 caracteres.'); return; }
    await this.withSessionAction(id, async () => {
      const { error } = await this.supabase.requireClient().rpc('open_session_dispute', {
        p_session_id: id,
        p_reason: reason
      });
      if (error) throw error;
      await this.loadRequests();
      this.toast.warning('El intercambio quedó reportado para revisión.');
    });
  }

  private async withSessionAction(sessionId: string, action: () => Promise<void>): Promise<void> {
    this.sessionActionsSignal.update(current => new Set(current).add(sessionId));
    try {
      await action();
    } catch (error) {
      this.toast.danger(this.requestErrorMessage(error));
    } finally {
      this.sessionActionsSignal.update(current => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
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
    if (message.includes('scheduled session time has not ended')) return 'La sesión aún no ha terminado. Podrás confirmarla al finalizar el horario acordado.';
    if (message.includes('cannot be cancelled after it starts')) return 'La sesión ya comenzó y no se puede cancelar desde la aplicación.';
    if (message.includes('please explain the dispute')) return 'Describe el problema con al menos 5 caracteres.';
    if (message.includes('cannot dispute this session')) return 'Esta sesión ya no se puede reportar.';
    if (message.includes('request is no longer pending')) return 'Esta solicitud ya recibió una respuesta.';
    return 'No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.';
  }
}
