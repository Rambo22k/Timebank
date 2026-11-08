import { Injectable, effect, signal, inject } from '@angular/core';
import { SolidarityCategory, SolidarityDonation, SolidarityDonationTarget, SolidarityFundSummary, SolidarityRequest, SolidarityRequestStatus } from '../models/solidarity.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

interface SolidarityRequestRow {
  id: string;
  user_id: string;
  reason: string;
  hours_requested: number;
  status: SolidarityRequestStatus;
  resolution_note: string | null;
  created_at: string;
}

interface DonationRow {
  id: string;
  amount: number;
  category_id: string | null;
  created_at: string;
}

interface ProfileRow { id: string; display_name: string; }
interface CategoryRow { id: string; name: string; }

@Injectable({ providedIn: 'root' })
export class SolidarityService {
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);

  private readonly summarySignal = signal<SolidarityFundSummary>({ availableCredits: 0, lifetimeDonatedCredits: 0, approvedRequests: 0, peopleHelped: 0 });
  private readonly balanceSignal = signal(0);
  private readonly requestsSignal = signal<SolidarityRequest[]>([]);
  private readonly donationsSignal = signal<SolidarityDonation[]>([]);
  private readonly pendingRequestsSignal = signal<SolidarityRequest[]>([]);
  private readonly categoriesSignal = signal<SolidarityCategory[]>([]);
  private readonly donationTargetsSignal = signal<SolidarityDonationTarget[]>([]);
  private readonly isAdminSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly savingSignal = signal(false);
  private activeUserId: string | null = null;
  private loadVersion = 0;

  readonly summary = this.summarySignal.asReadonly();
  readonly availableBalance = this.balanceSignal.asReadonly();
  readonly requests = this.requestsSignal.asReadonly();
  readonly donations = this.donationsSignal.asReadonly();
  readonly pendingRequests = this.pendingRequestsSignal.asReadonly();
  readonly categories = this.categoriesSignal.asReadonly();
  readonly donationTargets = this.donationTargetsSignal.asReadonly();
  readonly isAdmin = this.isAdminSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly isSaving = this.savingSignal.asReadonly();

  constructor() {
    effect(() => {
      const userId = this.auth.authUser()?.id ?? null;
      if (userId === this.activeUserId) return;
      this.activeUserId = userId;
      this.loadVersion++;
      this.clear();
      if (userId && this.supabase.client) void this.load();
    });
  }

  async load(): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId || !this.supabase.client) return;
    const version = ++this.loadVersion;
    this.loadingSignal.set(true);
    const client = this.supabase.requireClient();
    try {
      const roleResult = await client.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
      if (roleResult.error) throw roleResult.error;
      const isAdmin = roleResult.data?.role === 'admin';
      this.isAdminSignal.set(isAdmin);

      const [summaryResult, balanceResult, requestsResult, donationsResult, categoriesResult, pendingResult, targetsResult] = await Promise.all([
        client.from('solidarity_fund_summary').select('available_credits,lifetime_donated_credits,approved_requests,people_helped').maybeSingle(),
        client.from('credit_accounts').select('available_balance').eq('user_id', userId).maybeSingle(),
        client.from('solidarity_requests').select('id,user_id,reason,hours_requested,status,resolution_note,created_at').order('created_at', { ascending: false }),
        client.from('solidarity_donations').select('id,amount,category_id,created_at').eq('donor_id', userId).order('created_at', { ascending: false }).limit(50),
        client.from('categories').select('id,name').eq('is_active', true).order('name'),
        isAdmin
          ? client.from('solidarity_requests').select('id,user_id,reason,hours_requested,status,resolution_note,created_at').eq('status', 'pending').order('created_at')
          : Promise.resolve({ data: [], error: null }),
        client.rpc('list_solidarity_donation_targets')
      ]);
      if (summaryResult.error) throw summaryResult.error;
      if (balanceResult.error) throw balanceResult.error;
      if (requestsResult.error) throw requestsResult.error;
      if (donationsResult.error) throw donationsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (pendingResult.error) throw pendingResult.error;
      if (targetsResult.error) throw targetsResult.error;
      if (version !== this.loadVersion || userId !== this.activeUserId) return;

      const requests = (requestsResult.data ?? []) as SolidarityRequestRow[];
      const pendingRows = (pendingResult.data ?? []) as SolidarityRequestRow[];
      const profileIds = [...new Set(pendingRows.map(row => row.user_id))];
      const profileResult = profileIds.length
        ? await client.from('profiles').select('id,display_name').in('id', profileIds)
        : { data: [], error: null };
      if (profileResult.error) throw profileResult.error;
      if (version !== this.loadVersion || userId !== this.activeUserId) return;
      const profiles = new Map(((profileResult.data ?? []) as ProfileRow[]).map(profile => [profile.id, profile.display_name]));
      const mapRequest = (row: SolidarityRequestRow): SolidarityRequest => ({
        id: row.id, userId: row.user_id, userName: profiles.get(row.user_id) ?? 'Miembro TimeBank',
        reason: row.reason, hoursRequested: Number(row.hours_requested), status: row.status,
        resolutionNote: row.resolution_note, createdAt: row.created_at
      });
      const categories = (categoriesResult.data ?? []) as CategoryRow[];
      const categoryNames = new Map(categories.map(category => [category.id, category.name]));
      const summary = summaryResult.data as { available_credits: number; lifetime_donated_credits: number; approved_requests: number; people_helped: number } | null;
      this.summarySignal.set({
        availableCredits: Number(summary?.available_credits ?? 0),
        lifetimeDonatedCredits: Number(summary?.lifetime_donated_credits ?? 0),
        approvedRequests: Number(summary?.approved_requests ?? 0),
        peopleHelped: Number(summary?.people_helped ?? 0)
      });
      this.balanceSignal.set(Number(balanceResult.data?.available_balance ?? 0));
      this.requestsSignal.set(requests.map(mapRequest));
      this.pendingRequestsSignal.set(pendingRows.map(mapRequest));
      this.donationsSignal.set(((donationsResult.data ?? []) as DonationRow[]).map(row => ({
        id: row.id, amount: Number(row.amount), categoryName: row.category_id ? categoryNames.get(row.category_id) ?? null : null,
        createdAt: row.created_at
      })));
      this.categoriesSignal.set(categories.map(category => ({ id: category.id, name: category.name })));
      this.donationTargetsSignal.set((targetsResult.data ?? []).map((row: any) => ({
        requestId: row.request_id,
        publicSummary: row.public_summary,
        requestedCredits: Number(row.requested_credits),
        receivedCredits: Number(row.received_credits),
        remainingCredits: Number(row.remaining_credits),
        createdAt: row.created_at
      })));
    } catch {
      if (version === this.loadVersion && userId === this.activeUserId) this.toast.danger('No se pudo cargar la información de horas solidarias.');
    } finally {
      if (version === this.loadVersion) this.loadingSignal.set(false);
    }
  }

  async donate(amount: number, categoryId: string | null, solidarityRequestId: string | null = null): Promise<boolean> {
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100 || this.savingSignal()) return false;
    return this.withSaving(async () => {
      const { error } = await this.supabase.requireClient().rpc('donate_credits', {
        p_amount: amount, p_category_id: solidarityRequestId ? null : categoryId, p_solidarity_request_id: solidarityRequestId
      });
      if (error) throw error;
      this.toast.success(solidarityRequestId
        ? 'Tu donación quedó registrada y se sumó al objetivo de apoyo publicado.'
        : 'Tu donación quedó registrada. Gracias por apoyar a la comunidad.');
      await this.load();
      try {
        await this.auth.reloadAuthenticatedUser();
      } catch {
        this.toast.warning('La donación quedó registrada, pero no se pudo actualizar tu saldo en pantalla.');
      }
      return true;
    }, 'No se pudo registrar la donación. Revisa tu saldo y vuelve a intentarlo.');
  }

  async createRequest(reason: string, hours: number, acceptsDirectDonations = false, publicSummary = ''): Promise<boolean> {
    const userId = this.auth.authUser()?.id;
    const details = reason.trim();
    if (!userId || details.length < 10 || details.length > 3000 || !Number.isFinite(hours) || hours <= 0 || Math.round(hours * 100) !== hours * 100 || this.savingSignal()) return false;
    if (acceptsDirectDonations && (publicSummary.trim().length < 12 || publicSummary.trim().length > 280)) return false;
    return this.withSaving(async () => {
      const { error } = await this.supabase.requireClient().rpc('create_solidarity_request', {
        p_reason: details,
        p_hours_requested: hours,
        p_accepts_direct_donations: acceptsDirectDonations,
        p_public_summary: acceptsDirectDonations ? publicSummary.trim() : null
      });
      if (error) throw error;
      this.toast.success('Tu solicitud de apoyo solidario fue enviada para revisión.');
      await this.load();
      return true;
    }, 'No se pudo enviar la solicitud. Comprueba que no tengas otra solicitud pendiente.');
  }

  async cancelRequest(requestId: string): Promise<boolean> {
    return this.withSaving(async () => {
      const { error } = await this.supabase.requireClient().rpc('cancel_solidarity_request', { p_request_id: requestId });
      if (error) throw error;
      this.toast.success('La solicitud fue cancelada.');
      await this.load();
      return true;
    }, 'No se pudo cancelar la solicitud.');
  }

  async resolveRequest(requestId: string, approve: boolean, note: string): Promise<boolean> {
    if (!this.isAdminSignal()) return false;
    return this.withSaving(async () => {
      const { error } = await this.supabase.requireClient().rpc('resolve_solidarity_request', {
        p_request_id: requestId, p_approve: approve, p_note: note.trim() || null
      });
      if (error) throw error;
      this.toast.success(approve ? 'La solicitud fue aprobada y los créditos asignados.' : 'La solicitud fue rechazada.');
      await this.load();
      return true;
    }, 'No se pudo resolver la solicitud. Revisa el saldo del fondo y los límites mensuales.');
  }

  private async withSaving(action: () => Promise<boolean>, errorMessage: string): Promise<boolean> {
    this.savingSignal.set(true);
    try { return await action(); }
    catch { this.toast.danger(errorMessage); return false; }
    finally { this.savingSignal.set(false); }
  }

  private clear(): void {
    this.summarySignal.set({ availableCredits: 0, lifetimeDonatedCredits: 0, approvedRequests: 0, peopleHelped: 0 });
    this.balanceSignal.set(0); this.requestsSignal.set([]); this.donationsSignal.set([]);
    this.pendingRequestsSignal.set([]); this.categoriesSignal.set([]); this.isAdminSignal.set(false);
    this.donationTargetsSignal.set([]);
    this.loadingSignal.set(false); this.savingSignal.set(false);
  }
}
