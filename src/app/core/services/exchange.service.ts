import { Injectable, computed, effect, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { CreditActivity, ExchangeRequest, ExchangeReview, ExchangeSession } from '../models/exchange.model';
import { SupabaseService } from './supabase.service';

interface RequestRow {
  id: string;
  initiator_id: string;
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

interface CreditTransactionRow {
  id: string;
  transaction_type: string;
  amount: number;
  requester_id: string | null;
  provider_id: string | null;
  session_id: string | null;
  description: string;
  created_at: string;
}

interface CreditLedgerSnapshotRow {
  transaction_id: string;
  available_before: number;
  available_after: number;
  reserved_before: number;
  reserved_after: number;
}

interface ReviewRow {
  id: string;
  session_id: string;
  author_id: string;
  recipient_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ExchangeService {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private supabase = inject(SupabaseService);

  private requestsSignal = signal<ExchangeRequest[]>([]);
  private requestsLoadingSignal = signal(false);
  private requestsLoadVersion = 0;
  private walletLoadVersion = 0;
  private reviewsLoadVersion = 0;
  private activeDataUserId: string | null = null;
  private sessionsSignal = signal<ExchangeSession[]>([]);
  private sessionActionsSignal = signal<Set<string>>(new Set());
  private activitySignal = signal<CreditActivity[]>([]);
  private reservedBalanceSignal = signal(0);
  private walletLoadingSignal = signal(false);
  private reviewsSignal = signal<ExchangeReview[]>([]);
  private reviewsLoadingSignal = signal(false);

  readonly requests = this.requestsSignal.asReadonly();
  readonly isLoadingRequests = this.requestsLoadingSignal.asReadonly();
  readonly sessions = this.sessionsSignal.asReadonly();
  readonly sessionActions = this.sessionActionsSignal.asReadonly();
  readonly activity = this.activitySignal.asReadonly();
  readonly reservedBalance = this.reservedBalanceSignal.asReadonly();
  readonly isLoadingWallet = this.walletLoadingSignal.asReadonly();
  readonly reviews = this.reviewsSignal.asReadonly();
  readonly isLoadingReviews = this.reviewsLoadingSignal.asReadonly();
  get currentTimezone(): string {
    return this.auth.currentUser()?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  }
  get currentLocale(): string {
    return this.auth.currentUser()?.preferredLanguage === 'en' ? 'en-US' : 'es';
  }
  readonly balance = computed(() => this.auth.currentUser()?.timeCredits ?? 0);

  constructor() {
    effect(() => {
      const userId = this.auth.authUser()?.id ?? null;
      if (userId !== this.activeDataUserId) {
        this.activeDataUserId = userId;
        this.activitySignal.set([]);
        this.reservedBalanceSignal.set(0);
        this.reviewsSignal.set([]);
      }
      void this.loadRequests();
    });
  }

  get currentUserId(): string { return this.auth.authUser()?.id ?? ''; }
  requestsFor(direction: 'incoming' | 'outgoing'): ExchangeRequest[] {
    return this.requestsSignal().filter(r =>
      (r.requesterId === this.currentUserId || r.providerId === this.currentUserId)
      && (direction === 'incoming' ? r.initiatorId !== this.currentUserId : r.initiatorId === this.currentUserId)
    );
  }
  requestCounterpart(request: ExchangeRequest): { name: string; avatar: string; summary: string } {
    const isIncoming = request.initiatorId !== this.currentUserId;
    const counterpartIsRequester = isIncoming ? request.requesterId === request.initiatorId : request.requesterId !== this.currentUserId;
    const name = counterpartIsRequester ? request.requesterName : request.providerName;
    const avatar = counterpartIsRequester ? request.requesterAvatar : request.providerAvatar;
    const summary = isIncoming
      ? (request.initiatorId === request.providerId ? 'Te ofrece enseñarte' : 'Quiere aprender contigo')
      : (request.initiatorId === request.providerId ? 'Le ofreces enseñar' : 'Quieres aprender');
    return { name, avatar, summary };
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
  confirmationCount(session: ExchangeSession): number {
    return Number(session.requesterConfirmed) + Number(session.providerConfirmed);
  }
  confirmationMessage(session: ExchangeSession): string {
    if (this.hasCurrentUserConfirmed(session)) return 'Ya confirmaste. Estamos esperando la confirmación de la otra persona.';
    const otherConfirmed = session.requesterId === this.currentUserId ? session.providerConfirmed : session.requesterConfirmed;
    if (otherConfirmed) return 'La otra persona ya confirmó. Tu confirmación completa el intercambio y liquida los créditos.';
    if (this.canConfirmSession(session)) return 'La sesión terminó. Confirma que se realizó para que la otra persona también pueda confirmarla.';
    return 'La confirmación se habilitará cuando termine el horario reservado.';
  }
  isSessionActionPending(sessionId: string): boolean { return this.sessionActionsSignal().has(sessionId); }
  canCancelSession(session: ExchangeSession): boolean {
    return session.status === 'scheduled' && new Date(session.startAt) > new Date();
  }
  partnerFor(session: ExchangeSession): { name: string; avatar: string } {
    return { name: session.partnerName, avatar: session.partnerAvatar };
  }
  pendingReviews(): ExchangeSession[] {
    return this.sessionsForCurrentUser().filter(s => s.status === 'completed' && !s.reviewSubmitted);
  }
  reviewsForCurrentUser(): ExchangeReview[] {
    return this.reviewsSignal().filter(r => r.recipientId === this.currentUserId);
  }

  async loadWalletActivity(): Promise<void> {
    const version = ++this.walletLoadVersion;
    const userId = this.auth.authUser()?.id;
    const client = this.supabase.client;
    if (!userId || !client) {
      this.activitySignal.set([]);
      this.reservedBalanceSignal.set(0);
      this.walletLoadingSignal.set(false);
      return;
    }

    this.walletLoadingSignal.set(true);
    try {
      const accountResult = await client.from('credit_accounts')
        .select('id,reserved_balance').eq('user_id', userId).maybeSingle();
      if (accountResult.error) throw accountResult.error;
      const account = accountResult.data as { id: string; reserved_balance: number } | null;
      const transactions: CreditTransactionRow[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await client.from('credit_transactions')
          .select('id,transaction_type,amount,requester_id,provider_id,session_id,description,created_at')
          .or(`requester_id.eq.${userId},provider_id.eq.${userId}`)
          .order('created_at', { ascending: false }).range(from, from + 499);
        if (error) throw error;
        const page = (data ?? []) as CreditTransactionRow[];
        transactions.push(...page);
        if (page.length < 500) break;
        if (version !== this.walletLoadVersion || userId !== this.auth.authUser()?.id) return;
      }
      const ledgerSnapshots = new Map<string, CreditLedgerSnapshotRow>();
      const transactionIds = transactions.map(row => row.id);
      if (account?.id && transactionIds.length) {
        for (let offset = 0; offset < transactionIds.length; offset += 500) {
          const ids = transactionIds.slice(offset, offset + 500);
          const { data, error } = await client.from('credit_ledger_entries')
            .select('transaction_id,available_before,available_after,reserved_before,reserved_after,available_delta')
            .eq('account_id', account.id).in('transaction_id', ids);
          if (error) throw error;
          for (const row of data ?? []) {
            ledgerSnapshots.set(row.transaction_id as string, {
              transaction_id: row.transaction_id as string,
              available_before: Number(row.available_before),
              available_after: Number(row.available_after),
              reserved_before: Number(row.reserved_before),
              reserved_after: Number(row.reserved_after)
            });
          }
        }
      }

      if (version !== this.walletLoadVersion || userId !== this.auth.authUser()?.id) return;

      this.reservedBalanceSignal.set(Number(account?.reserved_balance ?? 0));
      this.activitySignal.set(transactions.flatMap(row => {
        const value = Number(row.amount);
        let title = '';
        let detail = '';
        let amount = 0;
        let type: CreditActivity['type'] = 'spent';
        switch (row.transaction_type) {
          case 'welcome':
            title = 'Créditos de bienvenida'; detail = 'Saldo inicial de TimeBank'; amount = value; type = 'welcome'; break;
          case 'session_reservation':
            title = 'Créditos reservados'; detail = 'Se reservaron créditos para una sesión agendada.'; amount = -value; type = 'reserved'; break;
          case 'session_payment':
            if (row.requester_id === userId) {
              title = 'Sesión recibida'; detail = 'Créditos liquidados al completar el intercambio.'; amount = -value; type = 'spent';
            } else if (row.provider_id === userId) {
              title = 'Sesión impartida'; detail = 'Créditos recibidos al completar el intercambio.'; amount = value; type = 'earned';
            } else return [];
            break;
          case 'session_refund':
            if (row.requester_id !== userId) return [];
            title = 'Créditos devueltos'; detail = 'Créditos reservados devueltos a tu billetera.'; amount = value; type = 'refund'; break;
          case 'solidarity_donation':
            if (row.requester_id !== userId) return [];
            title = 'Donación solidaria'; detail = 'Aporte al fondo solidario.'; amount = -value; type = 'spent'; break;
          case 'solidarity_award':
            if (row.provider_id !== userId) return [];
            title = 'Apoyo solidario recibido'; detail = 'Créditos recibidos del fondo solidario.'; amount = value; type = 'earned'; break;
          case 'admin_adjustment': {
            if (row.provider_id !== userId) return [];
            const ledger = ledgerSnapshots.get(row.id);
            const delta = ledger ? ledger.available_after - ledger.available_before : value;
            title = 'Ajuste de créditos'; detail = row.description || 'Actualización administrativa del saldo.';
            amount = delta; type = delta >= 0 ? 'earned' : 'spent'; break;
          }
          default: return [];
        }
        const ledger = ledgerSnapshots.get(row.id);
        return [{
          id: row.id,
          reference: row.id,
          title,
          detail,
          date: row.created_at,
          amount,
          availableBefore: ledger?.available_before ?? null,
          availableAfter: ledger?.available_after ?? null,
          reservedBefore: ledger?.reserved_before ?? null,
          reservedAfter: ledger?.reserved_after ?? null,
          type
        }];
      }));
    } catch {
      if (version === this.walletLoadVersion && userId === this.auth.authUser()?.id) {
        this.toast.danger('No se pudo cargar el historial de tu billetera. Inténtalo de nuevo.');
      }
    } finally {
      if (version === this.walletLoadVersion) this.walletLoadingSignal.set(false);
    }
  }

  async loadReviews(): Promise<void> {
    const version = ++this.reviewsLoadVersion;
    const userId = this.auth.authUser()?.id;
    const client = this.supabase.client;
    if (!userId || !client) {
      this.reviewsSignal.set([]);
      this.reviewsLoadingSignal.set(false);
      return;
    }

    this.reviewsLoadingSignal.set(true);
    try {
      const { data, error } = await client.from('reviews')
        .select('id,session_id,author_id,recipient_id,rating,comment,created_at')
        .eq('recipient_id', userId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const rows = (data ?? []) as ReviewRow[];
      const authorIds = [...new Set(rows.map(row => row.author_id))];
      const sessionIds = [...new Set(rows.map(row => row.session_id))];
      const [profileResult, sessionResult] = await Promise.all([
        authorIds.length ? client.from('profiles').select('id,display_name,avatar_path').in('id', authorIds) : Promise.resolve({ data: [], error: null }),
        sessionIds.length ? client.from('sessions').select('id,request_id').in('id', sessionIds) : Promise.resolve({ data: [], error: null })
      ]);
      if (profileResult.error) throw profileResult.error;
      if (sessionResult.error) throw sessionResult.error;
      const sessionRows = (sessionResult.data ?? []) as { id: string; request_id: string }[];
      const requestIds = [...new Set(sessionRows.map(row => row.request_id))];
      const requestResult = requestIds.length
        ? await client.from('session_requests').select('id,skill_id').in('id', requestIds)
        : { data: [], error: null };
      if (requestResult.error) throw requestResult.error;
      const skillIds = [...new Set((requestResult.data ?? []).map(row => row.skill_id as string))];
      const skillResult = skillIds.length
        ? await client.from('skills').select('id,title').in('id', skillIds)
        : { data: [], error: null };
      if (skillResult.error) throw skillResult.error;

      if (version !== this.reviewsLoadVersion || userId !== this.auth.authUser()?.id) return;

      const profiles = new Map((profileResult.data ?? []).map(row => [row.id as string, row]));
      const sessions = new Map(sessionRows.map(row => [row.id, row.request_id]));
      const requests = new Map((requestResult.data ?? []).map(row => [row.id as string, row.skill_id as string]));
      const skills = new Map((skillResult.data ?? []).map(row => [row.id as string, row.title as string]));
      this.reviewsSignal.set(rows.map(row => {
        const author = profiles.get(row.author_id);
        const requestId = sessions.get(row.session_id);
        const skillId = requestId ? requests.get(requestId) : undefined;
        return {
          id: row.id,
          sessionId: row.session_id,
          authorId: row.author_id,
          authorName: author?.display_name ?? 'Miembro de TimeBank',
          authorAvatar: this.avatarUrl(author?.avatar_path as string | null | undefined),
          recipientId: row.recipient_id,
          recipientName: this.auth.currentUser()?.name ?? 'Miembro de TimeBank',
          skillTitle: skillId ? skills.get(skillId) ?? 'Intercambio de habilidades' : 'Intercambio de habilidades',
          rating: Number(row.rating),
          comment: row.comment,
          createdAt: row.created_at
        };
      }));
    } catch {
      if (version === this.reviewsLoadVersion && userId === this.auth.authUser()?.id) {
        this.toast.danger('No se pudieron cargar las reseñas recibidas. Inténtalo de nuevo.');
      }
    } finally {
      if (version === this.reviewsLoadVersion) this.reviewsLoadingSignal.set(false);
    }
  }

  async loadRequests(): Promise<void> {
    const version = ++this.requestsLoadVersion;
    const userId = this.auth.authUser()?.id;
    const client = this.supabase.client;
    if (!userId || !client) {
      this.requestsSignal.set([]);
      this.sessionsSignal.set([]);
      this.walletLoadVersion++;
      this.reviewsLoadVersion++;
      this.activitySignal.set([]);
      this.reservedBalanceSignal.set(0);
      this.reviewsSignal.set([]);
      this.walletLoadingSignal.set(false);
      this.reviewsLoadingSignal.set(false);
      this.requestsLoadingSignal.set(false);
      return;
    }

    this.requestsSignal.set([]);
    this.sessionsSignal.set([]);
    this.requestsLoadingSignal.set(true);
    try {
      const { data, error } = await client.from('session_requests')
        .select('id, initiator_id, requester_id, provider_id, skill_id, message, proposed_start_at, requested_hours, status, created_at')
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
        initiatorId: row.initiator_id,
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

  async createRequest(data: Omit<ExchangeRequest, 'id' | 'initiatorId' | 'status' | 'createdAt' | 'requesterId' | 'requesterName' | 'requesterAvatar'>): Promise<boolean> {
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
      this.toast.danger(await this.requestErrorMessage(error));
      return false;
    }
  }

  async createTeachingOffer(data: {
    recipientId: string;
    wantedSkillId: string;
    providerSkillId: string;
    message: string;
    proposedStartAt: string;
    requestedHours: number;
  }): Promise<boolean> {
    if (!this.auth.authUser()) {
      this.toast.warning('Inicia sesión para ofrecer una sesión.');
      return false;
    }
    try {
      const { error } = await this.supabase.requireClient().rpc('create_teaching_offer', {
        p_recipient_id: data.recipientId,
        p_wanted_skill_id: data.wantedSkillId,
        p_provider_skill_id: data.providerSkillId,
        p_message: data.message,
        p_proposed_start_at: data.proposedStartAt,
        p_requested_hours: data.requestedHours
      });
      if (error) throw error;
      await this.loadRequests();
      this.toast.success('Oferta enviada. La persona puede aceptarla, rechazarla o proponer otro horario.');
      return true;
    } catch (error) {
      this.toast.danger(await this.requestErrorMessage(error));
      return false;
    }
  }

  async respondToRequest(id: string, action: 'accept' | 'reject'): Promise<void> {
    const request = this.requestsSignal().find(item => item.id === id);
    if (!request || request.initiatorId === this.currentUserId || request.status !== 'pending') return;
    try {
      const result = action === 'accept'
        ? await this.supabase.requireClient().functions.invoke('create-google-meet-session', { body: { requestId: id } })
        : await this.supabase.requireClient().rpc('respond_to_session_request', {
            p_request_id: id,
            p_action: action,
            p_new_start_at: null
          });
      const { error } = result;
      if (error) throw error;
      await Promise.all([this.loadRequests(), ...(action === 'accept' ? [this.auth.reloadAuthenticatedUser()] : [])]);
      this.toast.success(action === 'accept' ? 'Solicitud aceptada y sesión agendada.' : 'Solicitud rechazada.');
    } catch (error) {
      this.toast.danger(await this.requestErrorMessage(error));
    }
  }

  async cancelRequest(id: string): Promise<void> {
    try {
      const { error } = await this.supabase.requireClient().rpc('cancel_session_request', {
        p_request_id: id,
        p_reason: null
      });
      if (error) throw error;
      await Promise.all([this.loadRequests(), this.auth.reloadAuthenticatedUser()]);
      this.toast.info('Solicitud cancelada.');
    } catch (error) {
      this.toast.danger(await this.requestErrorMessage(error));
    }
  }

  async rescheduleRequest(id: string, proposedStartAt: string): Promise<void> {
    const request = this.requestsSignal().find(item => item.id === id);
    const startAt = new Date(proposedStartAt);
    if (!request || request.initiatorId === this.currentUserId || request.status !== 'pending') return;
    if (Number.isNaN(startAt.getTime())) {
      this.toast.warning('Ese horario no es válido en tu zona horaria. Elige otra hora.');
      return;
    }
    if (startAt <= new Date()) {
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
      this.toast.danger(await this.requestErrorMessage(error));
    }
  }

  async acceptRescheduledRequest(id: string): Promise<void> {
    const request = this.requestsSignal().find(item => item.id === id);
    if (!request || request.initiatorId !== this.currentUserId || request.status !== 'rescheduled') return;
    try {
      const { error } = await this.supabase.requireClient().functions.invoke('create-google-meet-session', { body: { requestId: id } });
      if (error) throw error;
      await Promise.all([this.loadRequests(), this.auth.reloadAuthenticatedUser()]);
      this.toast.success('Horario aceptado. La sesión ya está agendada.');
    } catch (error) {
      this.toast.danger(await this.requestErrorMessage(error));
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
      this.toast.danger(await this.requestErrorMessage(error));
    } finally {
      this.sessionActionsSignal.update(current => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  }

  async submitReview(sessionId: string, rating: number, comment: string): Promise<void> {
    const session = this.sessionsSignal().find(item => item.id === sessionId);
    const text = comment.trim();
    if (!session || !this.auth.authUser() || rating < 1 || rating > 5 || session.status !== 'completed' || session.reviewSubmitted) return;
    if (text.length > 2000) { this.toast.warning('La reseña no puede superar los 2000 caracteres.'); return; }
    try {
      const { error } = await this.supabase.requireClient().rpc('submit_review', {
        p_session_id: sessionId,
        p_rating: rating,
        p_comment: text
      });
      if (error) throw error;
      await Promise.all([this.loadReviews(), this.loadRequests(), this.auth.reloadAuthenticatedUser()]);
      this.toast.success('Reseña publicada. Gracias por compartir tu experiencia.');
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
      if (message.includes('duplicate key')) this.toast.warning('Ya publicaste una reseña para esta sesión.');
      else if (message.includes('only participants of completed sessions')) this.toast.warning('Solo puedes reseñar una sesión completada en la que participaste.');
      else this.toast.danger('No se pudo publicar la reseña. Inténtalo de nuevo.');
    }
  }

  private avatarUrl(path: string | null | undefined): string {
    if (!path) return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
    if (/^https?:\/\//i.test(path)) return path;
    return this.supabase.client?.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl ?? '';
  }

  private async requestErrorMessage(error: unknown): Promise<string> {
    let rawMessage = error instanceof Error ? error.message : String(error ?? '');
    let googleDiagnosticMessage: string | null = null;
    if (error && typeof error === 'object' && 'context' in error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const payload = await context.clone().json().catch(() => ({})) as {
          error?: string;
          message?: string;
          code?: string;
          diagnostic?: { httpStatus?: number; googleStatus?: string | null; googleCode?: number | null; message?: string; reasons?: string[] };
        };
        rawMessage = payload.error ?? payload.message ?? rawMessage;
        if (payload.code === 'google_meet_api_error' && payload.diagnostic) {
          const diagnostic = payload.diagnostic;
          const status = diagnostic.googleStatus || `HTTP ${diagnostic.httpStatus ?? 'error'}`;
          const reasons = diagnostic.reasons?.length ? ` (${diagnostic.reasons.join(', ')})` : '';
          const detail = diagnostic.message || 'Google no indicó el motivo.';
          googleDiagnosticMessage = `Google rechazó la creación de la reunión (${status}${reasons}): ${detail}`;
        }
      }
    }
    const message = rawMessage.toLowerCase();
    if (googleDiagnosticMessage) return googleDiagnosticMessage;
    if (message.includes('must connect google meet') || message.includes('provider must connect')) return 'El proveedor debe conectar Google Meet desde su perfil antes de aceptar esta solicitud.';
    if (message.includes('google meet connection expired')) return 'La conexión de Google Meet del proveedor venció. Debe volver a conectarla desde su perfil.';
    if (message.includes('google meet could not create')) return 'No se pudo crear la reunión de Google Meet. Revisa que Meet API esté habilitada en Google Cloud.';
    if (message.includes('balance first') || message.includes('insufficient available credits')) return 'No hay créditos suficientes para reservar esta sesión.';
    if (message.includes('confirm your email')) return 'Confirma tu correo antes de enviar una solicitud.';
    if (message.includes('complete your age and policy acceptance')) return 'Completa tu fecha de nacimiento y acepta las políticas para continuar.';
    if (message.includes('learner must confirm their email')) return 'La persona que aprenderá debe confirmar su correo antes de recibir una oferta.';
    if (message.includes('learner must complete age and policy acceptance')) return 'La persona que aprenderá debe completar sus datos y aceptar las políticas antes de recibir una oferta.';
    if (message.includes('choose an active offered skill')) return 'Elige una habilidad ofrecida activa de la misma categoría.';
    if (message.includes('active request already exists')) return 'Ya hay una propuesta activa con esa persona para esta habilidad.';
    if (message.includes('future date') || message.includes('proposed date')) return 'Elige una fecha futura para la sesión.';
    if (message.includes('scheduled session time has not ended')) return 'La sesión aún no ha terminado. Podrás confirmarla al finalizar el horario acordado.';
    if (message.includes('cannot be cancelled after it starts')) return 'La sesión ya comenzó y no se puede cancelar desde la aplicación.';
    if (message.includes('please explain the dispute')) return 'Describe el problema con al menos 5 caracteres.';
    if (message.includes('cannot dispute this session')) return 'Esta sesión ya no se puede reportar.';
    if (message.includes('request is no longer pending')) return 'Esta solicitud ya recibió una respuesta.';
    return 'No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.';
  }
}
