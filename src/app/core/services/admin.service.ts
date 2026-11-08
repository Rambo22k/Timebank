import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

export interface AdminUserRow {
  id: string; display_name: string; country_code: string | null; is_verified: boolean; created_at: string;
  completed_sessions: number; account_status: 'active' | 'suspended' | 'deactivated'; suspension_reason: string | null;
  role: 'user' | 'admin'; available_balance: number;
}
export interface AdminCategoryRow { id: string; name: string; slug: string; description: string | null; icon: string | null; is_active: boolean; sort_order: number; }
export interface AdminReportRow { id: string; reporter_id: string; reporter_name: string; target_type: string; target_id: string; reason: string; status: string; created_at: string; }
export interface AdminVerificationRow { id: string; user_id: string; user_name: string; document_path: string; document_url: string | null; status: string; submitted_at: string; review_note: string | null; }
export interface AdminDisputeRow { id: string; request_id: string; requester_name: string; provider_name: string; duration_hours: number; dispute_reason: string | null; dispute_opened_at: string | null; }
export interface AdminTransactionRow { id: string; transaction_type: string; amount: number; requester_id: string | null; provider_id: string | null; description: string; created_at: string; }
export interface AdminAuditRow { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string; }
export interface AdminSettingRow { key: string; value: number; description: string; }

@Injectable({ providedIn: 'root' })
export class AdminService {
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);

  readonly loading = signal(false);
  readonly stats = signal<Record<string, any>>({});
  readonly users = signal<AdminUserRow[]>([]);
  readonly categories = signal<AdminCategoryRow[]>([]);
  readonly reports = signal<AdminReportRow[]>([]);
  readonly verifications = signal<AdminVerificationRow[]>([]);
  readonly disputes = signal<AdminDisputeRow[]>([]);
  readonly transactions = signal<AdminTransactionRow[]>([]);
  readonly audit = signal<AdminAuditRow[]>([]);
  readonly settings = signal<AdminSettingRow[]>([]);
  readonly selectedUserId = signal('');

  async load(): Promise<void> {
    if (!this.supabase.client) return;
    this.loading.set(true);
    const client = this.supabase.requireClient();
    try {
      const [stats, profiles, privateProfiles, roles, accounts, categories, reports, verifications, disputes, settings, audit] = await Promise.all([
        client.rpc('get_admin_dashboard_stats'),
        client.from('profiles').select('id,display_name,country_code,is_verified,created_at,completed_sessions').order('created_at', { ascending: false }).limit(250),
        client.from('profile_private').select('user_id,account_status,suspension_reason'),
        client.from('user_roles').select('user_id,role'),
        client.from('credit_accounts').select('user_id,available_balance').eq('account_type', 'user'),
        client.from('categories').select('id,name,slug,description,icon,is_active,sort_order').order('sort_order').order('name'),
        client.from('reports').select('id,reporter_id,target_type,target_id,reason,status,created_at').in('status', ['open', 'under_review']).order('created_at', { ascending: false }).limit(100),
        client.from('identity_verifications').select('id,user_id,document_path,status,submitted_at,review_note').eq('status', 'pending').order('submitted_at').limit(100),
        client.from('sessions').select('id,request_id,duration_hours,dispute_reason,dispute_opened_at').eq('status', 'disputed').order('dispute_opened_at', { ascending: false }).limit(100),
        client.from('app_settings').select('key,value,description').order('key'),
        client.from('admin_audit_log').select('id,actor_id,action,entity_type,entity_id,details,created_at').order('created_at', { ascending: false }).limit(100)
      ]);
      const results = [stats, profiles, privateProfiles, roles, accounts, categories, reports, verifications, disputes, settings, audit];
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;

      const privateById = new Map((privateProfiles.data ?? []).map((row: any) => [row.user_id, row]));
      const accountById = new Map((accounts.data ?? []).map((row: any) => [row.user_id, row.available_balance]));
      const roleById = new Map<string, 'user' | 'admin'>();
      for (const row of roles.data ?? []) if (row.role === 'admin') roleById.set(row.user_id, 'admin');
      this.users.set((profiles.data ?? []).map((row: any) => {
        const priv: any = privateById.get(row.id);
        return { ...row, account_status: priv?.account_status ?? 'active', suspension_reason: priv?.suspension_reason ?? null,
          role: roleById.get(row.id) ?? 'user', available_balance: Number(accountById.get(row.id) ?? 0) };
      }));
      this.stats.set((stats.data ?? {}) as Record<string, any>);
      this.categories.set((categories.data ?? []) as AdminCategoryRow[]);

      const reporterIds = [...new Set((reports.data ?? []).map((row: any) => row.reporter_id))];
      const verificationIds = [...new Set((verifications.data ?? []).map((row: any) => row.user_id))];
      const requestIds = [...new Set((disputes.data ?? []).map((row: any) => row.request_id))];
      const relatedIds = [...new Set([...reporterIds, ...verificationIds, ...requestIds])];
      const [relatedProfiles, requests] = await Promise.all([
        relatedIds.length ? client.from('profiles').select('id,display_name').in('id', relatedIds) : Promise.resolve({ data: [], error: null }),
        requestIds.length ? client.from('session_requests').select('id,requester_id,provider_id').in('id', requestIds) : Promise.resolve({ data: [], error: null })
      ]);
      if (relatedProfiles.error) throw relatedProfiles.error;
      if (requests.error) throw requests.error;
      const names = new Map((relatedProfiles.data ?? []).map((row: any) => [row.id, row.display_name]));
      const reqById = new Map((requests.data ?? []).map((row: any) => [row.id, row]));
      this.reports.set((reports.data ?? []).map((row: any) => ({ ...row, reporter_name: names.get(row.reporter_id) ?? 'Miembro' })));
      this.verifications.set(await Promise.all((verifications.data ?? []).map(async (row: any) => {
        const signed = await client.storage.from('identity-documents').createSignedUrl(row.document_path, 300);
        return { ...row, user_name: names.get(row.user_id) ?? 'Miembro', document_url: signed.data?.signedUrl ?? null };
      })));
      this.disputes.set((disputes.data ?? []).map((row: any) => {
        const request: any = reqById.get(row.request_id);
        return { ...row, requester_name: names.get(request?.requester_id) ?? 'Solicitante', provider_name: names.get(request?.provider_id) ?? 'Proveedor' };
      }));
      this.settings.set((settings.data ?? []).map((row: any) => ({ ...row, value: Number(row.value) })));
      this.audit.set((audit.data ?? []) as AdminAuditRow[]);
    } catch (error) {
      this.toast.danger(error instanceof Error ? error.message : 'No se pudo cargar el panel de administración.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadTransactions(userId = this.selectedUserId()): Promise<void> {
    if (!userId) { this.transactions.set([]); return; }
    const { data, error } = await this.supabase.requireClient().from('credit_transactions')
      .select('id,transaction_type,amount,requester_id,provider_id,description,created_at')
      .or(`requester_id.eq.${userId},provider_id.eq.${userId}`).order('created_at', { ascending: false }).limit(100);
    if (error) { this.toast.danger('No se pudieron cargar los movimientos de créditos.'); return; }
    this.selectedUserId.set(userId);
    this.transactions.set((data ?? []) as AdminTransactionRow[]);
  }

  async setUserStatus(user: AdminUserRow, status: 'active' | 'suspended' | 'deactivated', reason = ''): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('set_user_status', { p_user_id: user.id, p_status: status, p_reason: reason || null });
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success(status === 'active' ? 'Cuenta reactivada.' : 'Estado de la cuenta actualizado.');
    await this.load();
  }

  async setUserRole(user: AdminUserRow, grant: boolean): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('set_user_role', { p_user_id: user.id, p_role: 'admin', p_grant: grant });
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success(grant ? 'Rol de administrador asignado.' : 'Rol de administrador retirado.');
    await this.load();
  }

  async adjustCredits(userId: string, amount: number, reason: string): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('adjust_credits', { p_user_id: userId, p_amount: amount, p_reason: reason.trim() });
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success('Ajuste de créditos registrado en auditoría.');
    await this.load();
    await this.loadTransactions(userId);
  }

  async reviewVerification(id: string, approve: boolean, note: string): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('review_identity_verification', { p_verification_id: id, p_approve: approve, p_note: note.trim() || null });
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success(approve ? 'Identidad verificada.' : 'Verificación rechazada.');
    await this.load();
  }

  async resolveDispute(id: string, outcome: 'refund_requester' | 'pay_provider', note: string): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('resolve_session_dispute', { p_session_id: id, p_outcome: outcome, p_note: note.trim() });
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success('La disputa fue resuelta y el movimiento quedó registrado.');
    await this.load();
  }

  async resolveReport(id: string, status: 'resolved' | 'dismissed', note: string): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('update_report', { p_report_id: id, p_status: status, p_note: note.trim(), p_assigned_to: null });
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success('Reporte actualizado.');
    await this.load();
  }

  async saveCategory(category: Partial<AdminCategoryRow>): Promise<void> {
    const client = this.supabase.requireClient();
    const update = { name: category.name?.trim(), slug: category.slug?.trim().toLowerCase().replace(/\s+/g, '-'), description: category.description?.trim() || null, icon: category.icon?.trim() || null, is_active: category.is_active ?? true, sort_order: category.sort_order ?? 0 };
    const result = category.id ? await client.from('categories').update(update).eq('id', category.id) : await client.from('categories').insert(update);
    if (result.error) { this.toast.danger(result.error.message); return; }
    this.toast.success('Categoría guardada.');
    await this.load();
  }

  async setCategoryActive(category: AdminCategoryRow): Promise<void> {
    const { error } = await this.supabase.requireClient().from('categories').update({ is_active: !category.is_active }).eq('id', category.id);
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success(category.is_active ? 'Categoría archivada; las habilidades existentes se conservan.' : 'Categoría activada.');
    await this.load();
  }

  async moderateSkill(skillId: string, note: string): Promise<void> {
    const client = this.supabase.requireClient();
    const { data } = await client.auth.getUser();
    const { error } = await client.from('skills').update({ status: 'removed', moderation_note: note.trim() || 'Retirada por moderación', moderated_by: data.user?.id ?? null, moderated_at: new Date().toISOString() }).eq('id', skillId);
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success('Habilidad retirada del catálogo.');
    await this.load();
  }

  async saveSetting(key: string, value: number): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('update_app_setting', { p_key: key, p_value: value });
    if (error) { this.toast.danger(error.message); return; }
    this.toast.success('Parámetro actualizado.');
    await this.load();
  }
}
