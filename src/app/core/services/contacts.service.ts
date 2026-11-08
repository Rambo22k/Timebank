import { Injectable, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

export interface MemberSummary {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  avatar_url: string;
  location: string;
  country_code: string | null;
  reputation_average: number;
  reputation_count: number;
  offered_hours: number;
  received_hours: number;
  completed_sessions: number;
  created_at: string;
  is_verified: boolean;
}

export interface UserContact {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ContactsService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly members = signal<MemberSummary[]>([]);
  readonly contacts = signal<UserContact[]>([]);
  readonly activeProfileContact = signal<UserContact | null>(null);
  readonly loading = signal(false);
  private activeProfileId: string | null = null;

  async load(search = ''): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId) return;
    this.loading.set(true);
    const client = this.supabase.requireClient();
    try {
      const [membersResult, contactsResult] = await Promise.all([
        client.rpc('get_public_members', { p_search: search.trim() || null, p_limit: 50 }),
        client.from('user_contacts').select('id,requester_id,recipient_id,status,created_at')
          .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`).order('created_at', { ascending: false })
      ]);
      if (membersResult.error) throw membersResult.error;
      if (contactsResult.error) throw contactsResult.error;

      const relationships = (contactsResult.data ?? []) as UserContact[];
      this.contacts.set(relationships);
      const rows = [...(membersResult.data ?? [])] as any[];
      const relatedIds = [...new Set(relationships.flatMap(row => [row.requester_id, row.recipient_id]).filter(id => id !== userId))];
      if (relatedIds.length) {
        const { data, error } = await client.from('profiles')
          .select('id,display_name,headline,bio,avatar_path,location,country_code,reputation_average,reputation_count,offered_hours,received_hours,completed_sessions,created_at,is_verified')
          .in('id', relatedIds);
        if (error) throw error;
        const profileById = new Map((data ?? []).map((profile: any) => [profile.id, profile]));
        for (const id of relatedIds) {
          if (!rows.some(row => row.id === id)) {
            const profile = profileById.get(id);
            if (profile) rows.push(profile);
          }
        }
      }
      this.members.set(rows.map(row => this.mapMember(row)));
    } catch {
      this.toast.danger('No se pudo cargar la comunidad. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadRelationship(memberId: string): Promise<void> {
    const userId = this.auth.authUser()?.id;
    this.activeProfileId = memberId;
    this.activeProfileContact.set(null);
    if (!userId || userId === memberId) return;
    const { data, error } = await this.supabase.requireClient().from('user_contacts')
      .select('id,requester_id,recipient_id,status,created_at')
      .or(`and(requester_id.eq.${userId},recipient_id.eq.${memberId}),and(requester_id.eq.${memberId},recipient_id.eq.${userId})`)
      .maybeSingle();
    if (!error) this.activeProfileContact.set(data as UserContact | null);
  }

  relationship(memberId: string): UserContact | undefined {
    return this.contacts().find(row => row.requester_id === memberId || row.recipient_id === memberId);
  }

  incomingRequests(): UserContact[] {
    const userId = this.auth.authUser()?.id;
    return this.contacts().filter(row => row.status === 'pending' && row.recipient_id === userId);
  }

  acceptedContacts(): UserContact[] { return this.contacts().filter(row => row.status === 'accepted'); }

  member(id: string): MemberSummary | undefined { return this.members().find(row => row.id === id); }

  async sendRequest(memberId: string): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('send_user_contact_request', { p_recipient_id: memberId });
    if (error) { this.toast.warning(this.contactError(error.message)); return; }
    this.toast.success('Solicitud de contacto enviada.');
    await this.load();
    if (this.activeProfileId) await this.loadRelationship(this.activeProfileId);
  }

  async respond(contactId: string, accept: boolean): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('respond_user_contact_request', { p_contact_id: contactId, p_accept: accept });
    if (error) { this.toast.danger(this.contactError(error.message)); return; }
    this.toast.success(accept ? 'Ahora están en contacto.' : 'Solicitud rechazada.');
    await this.load();
    if (this.activeProfileId) await this.loadRelationship(this.activeProfileId);
  }

  async remove(contactId: string): Promise<void> {
    const { error } = await this.supabase.requireClient().rpc('remove_user_contact', { p_contact_id: contactId });
    if (error) { this.toast.danger(this.contactError(error.message)); return; }
    this.toast.info('Contacto eliminado.');
    await this.load();
    if (this.activeProfileId) await this.loadRelationship(this.activeProfileId);
  }

  private mapMember(row: any): MemberSummary {
    const path = row.avatar_path as string | null;
    const avatarUrl = path
      ? (/^https?:\/\//i.test(path) ? path : this.supabase.requireClient().storage.from('profile-avatars').getPublicUrl(path).data.publicUrl)
      : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
    return {
      id: row.id,
      display_name: row.display_name,
      headline: row.headline ?? 'Miembro de TimeBank',
      bio: row.bio ?? '',
      avatar_url: avatarUrl,
      location: row.location ?? row.country_code ?? 'En línea',
      country_code: row.country_code,
      reputation_average: Number(row.reputation_average ?? 0),
      reputation_count: Number(row.reputation_count ?? 0),
      offered_hours: Number(row.offered_hours ?? 0),
      received_hours: Number(row.received_hours ?? 0),
      completed_sessions: Number(row.completed_sessions ?? 0),
      created_at: row.created_at,
      is_verified: Boolean(row.is_verified)
    };
  }

  private contactError(message: string): string {
    const text = message.toLowerCase();
    if (text.includes('contacts are blocked')) return 'No puedes conectar con una cuenta bloqueada.';
    if (text.includes('already contacts')) return 'Esta persona ya está entre tus contactos.';
    if (text.includes('active')) return 'Una de las cuentas no puede realizar esta acción.';
    return 'No se pudo actualizar el contacto. Inténtalo de nuevo.';
  }
}
