import { Injectable, computed, effect, signal, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ChatConversation, ChatMessage, ConversationSummaryRow, MessageRow } from '../models/chat.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private auth = inject(AuthService);
  private supabase = inject(SupabaseService);
  private toast = inject(ToastService);

  private readonly conversationsSignal = signal<ChatConversation[]>([]);
  private readonly messagesSignal = signal<ChatMessage[]>([]);
  private readonly activeConversationIdSignal = signal<string | null>(null);
  private readonly conversationsLoadingSignal = signal(false);
  private readonly messagesLoadingSignal = signal(false);
  private readonly sendingSignal = signal(false);
  private readonly activeConversationBlockedSignal = signal(false);
  private readonly blockedByCurrentUserSignal = signal(false);
  private readonly blockStatusLoadingSignal = signal(false);
  private channel: RealtimeChannel | null = null;
  private conversationLoadVersion = 0;
  private messageLoadVersion = 0;

  readonly conversations = this.conversationsSignal.asReadonly();
  readonly messages = this.messagesSignal.asReadonly();
  readonly activeConversationId = this.activeConversationIdSignal.asReadonly();
  readonly activeConversation = computed(() => this.conversationsSignal().find(item => item.id === this.activeConversationIdSignal()) ?? null);
  readonly isLoadingConversations = this.conversationsLoadingSignal.asReadonly();
  readonly isLoadingMessages = this.messagesLoadingSignal.asReadonly();
  readonly isSending = this.sendingSignal.asReadonly();
  readonly isActiveConversationBlocked = this.activeConversationBlockedSignal.asReadonly();
  readonly isBlockedByCurrentUser = this.blockedByCurrentUserSignal.asReadonly();
  readonly isCheckingBlockStatus = this.blockStatusLoadingSignal.asReadonly();

  constructor() {
    effect(onCleanup => {
      const userId = this.auth.authUser()?.id ?? null;
      const version = ++this.conversationLoadVersion;
      this.messageLoadVersion++;
      this.activeConversationIdSignal.set(null);
      this.messagesSignal.set([]);
      this.activeConversationBlockedSignal.set(false);
      this.blockedByCurrentUserSignal.set(false);
      this.blockStatusLoadingSignal.set(false);

      if (!userId || !this.supabase.client) {
        this.conversationsSignal.set([]);
        this.conversationsLoadingSignal.set(false);
        this.messagesLoadingSignal.set(false);
        return;
      }

      const client = this.supabase.requireClient();
      this.conversationsLoadingSignal.set(true);
      this.channel = client.channel(`chat:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
          const row = payload.new as MessageRow;
          const conversation = this.conversationsSignal().find(item => item.conversationIds.includes(row.conversation_id));
          if (!conversation) return;
          const message = this.fromRow(row);
          const isActive = this.activeConversationIdSignal() === conversation.id;
          this.conversationsSignal.update(items => items.map(item => item.id !== conversation.id ? item : {
            ...item,
            lastMessage: message.body,
            lastMessageAt: message.createdAt,
            messageConversationId: row.conversation_id,
            unreadCount: row.sender_id === userId || isActive ? 0 : item.unreadCount + 1
          }));
          if (isActive) {
            this.messagesSignal.update(items => items.some(item => item.id === message.id) ? items : [...items, message]);
            if (row.sender_id !== userId) void this.markConversationRead(conversation.id);
          }
        })
        .subscribe();

      onCleanup(() => {
        if (this.channel) void client.removeChannel(this.channel);
        this.channel = null;
      });
      void this.loadConversationsForUser(userId, version);
    });
  }

  async loadConversations(): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId) return;
    await this.loadConversationsForUser(userId, ++this.conversationLoadVersion);
  }

  async selectConversation(conversationId: string): Promise<void> {
    if (!this.conversationsSignal().some(item => item.id === conversationId)) return;
    const version = ++this.messageLoadVersion;
    this.activeConversationIdSignal.set(conversationId);
    this.messagesSignal.set([]);
    this.messagesLoadingSignal.set(true);
    this.blockStatusLoadingSignal.set(true);
    this.activeConversationBlockedSignal.set(false);
    this.blockedByCurrentUserSignal.set(false);
    try {
      const conversation = this.conversationsSignal().find(item => item.id === conversationId);
      if (conversation) await this.refreshBlockStatus(conversationId, conversation.peerId, version);
      const { data, error } = await this.supabase.requireClient().from('messages')
        .select('id,conversation_id,sender_id,body,created_at,deleted_at')
        .in('conversation_id', conversation?.conversationIds ?? []).order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      if (version !== this.messageLoadVersion || this.activeConversationIdSignal() !== conversationId) return;
      this.messagesSignal.set(((data ?? []) as MessageRow[]).map(row => this.fromRow(row)).reverse());
      await this.markConversationRead(conversationId);
    } catch {
      if (version === this.messageLoadVersion) {
        this.blockStatusLoadingSignal.set(false);
        this.activeConversationBlockedSignal.set(true);
      }
      this.toast.danger('No se pudo abrir la conversación. Inténtalo de nuevo.');
    } finally {
      if (version === this.messageLoadVersion) this.messagesLoadingSignal.set(false);
    }
  }

  async sendMessage(body: string): Promise<boolean> {
    const conversation = this.activeConversation();
    const conversationId = conversation?.messageConversationId;
    const senderId = this.auth.authUser()?.id;
    const text = body.trim();
    if (!conversationId || !senderId || !text || text.length > 5000 || this.sendingSignal()) return false;
    this.sendingSignal.set(true);
    try {
      const { data, error } = await this.supabase.requireClient().from('messages')
        .insert({ conversation_id: conversationId, sender_id: senderId, body: text })
        .select('id,conversation_id,sender_id,body,created_at,deleted_at').single();
      if (error) throw error;
      const message = this.fromRow(data as MessageRow);
      this.messagesSignal.update(items => items.some(item => item.id === message.id) ? items : [...items, message]);
      this.conversationsSignal.update(items => items.map(item => item.id !== conversation?.id ? item : {
        ...item, lastMessage: message.body, lastMessageAt: message.createdAt
      }));
      return true;
    } catch {
      this.toast.danger('No se pudo enviar el mensaje. Inténtalo de nuevo.');
      return false;
    } finally {
      this.sendingSignal.set(false);
    }
  }

  async reportUser(userId: string, reason: string): Promise<boolean> {
    return this.createReport('user', userId, reason);
  }

  async reportMessage(messageId: string, reason: string): Promise<boolean> {
    const message = this.messagesSignal().find(item => item.id === messageId);
    if (!message || message.senderId === this.auth.authUser()?.id) return false;
    return this.createReport('message', messageId, reason);
  }

  async blockActivePeer(): Promise<boolean> {
    const currentUserId = this.auth.authUser()?.id;
    const conversation = this.activeConversation();
    if (!currentUserId || !conversation || this.blockedByCurrentUserSignal()) return false;
    const client = this.supabase.requireClient();
    try {
      const existing = await client.from('user_blocks').select('blocker_id')
        .eq('blocker_id', currentUserId).eq('blocked_id', conversation.peerId).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        const { error } = await client.from('user_blocks').insert({ blocker_id: currentUserId, blocked_id: conversation.peerId });
        if (error) throw error;
      }
      this.activeConversationBlockedSignal.set(true);
      this.blockedByCurrentUserSignal.set(true);
      this.toast.success('La cuenta quedó bloqueada. No podrán enviarse mensajes entre ustedes.');
      return true;
    } catch {
      this.toast.danger('No se pudo bloquear esta cuenta. Inténtalo de nuevo.');
      return false;
    }
  }

  async unblockActivePeer(): Promise<boolean> {
    const currentUserId = this.auth.authUser()?.id;
    const conversation = this.activeConversation();
    if (!currentUserId || !conversation || !this.blockedByCurrentUserSignal()) return false;
    try {
      const { error } = await this.supabase.requireClient().from('user_blocks').delete()
        .eq('blocker_id', currentUserId).eq('blocked_id', conversation.peerId);
      if (error) throw error;
      this.blockedByCurrentUserSignal.set(false);
      await this.refreshBlockStatus(conversation.id, conversation.peerId, this.messageLoadVersion);
      if (!this.activeConversationBlockedSignal()) this.toast.success('La cuenta fue desbloqueada.');
      return !this.activeConversationBlockedSignal();
    } catch {
      this.toast.danger('No se pudo desbloquear esta cuenta. Inténtalo de nuevo.');
      return false;
    }
  }

  closeConversation(): void {
    this.messageLoadVersion++;
    this.activeConversationIdSignal.set(null);
    this.messagesSignal.set([]);
    this.activeConversationBlockedSignal.set(false);
    this.blockedByCurrentUserSignal.set(false);
    this.blockStatusLoadingSignal.set(false);
  }

  private async refreshBlockStatus(conversationId: string, peerId: string, version: number): Promise<void> {
    const currentUserId = this.auth.authUser()?.id;
    if (!currentUserId) return;
    const { data, error } = await this.supabase.requireClient().from('user_blocks')
      .select('blocker_id,blocked_id')
      .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${peerId}),and(blocker_id.eq.${peerId},blocked_id.eq.${currentUserId})`)
      .limit(1).maybeSingle();
    if (version !== this.messageLoadVersion || this.activeConversationIdSignal() !== conversationId) return;
    this.blockStatusLoadingSignal.set(false);
    if (error) {
      this.activeConversationBlockedSignal.set(true);
      this.blockedByCurrentUserSignal.set(false);
      this.toast.warning('No se pudo comprobar el estado de seguridad de esta conversación.');
      return;
    }
    this.activeConversationBlockedSignal.set(!!data);
    this.blockedByCurrentUserSignal.set(data?.blocker_id === currentUserId);
  }

  private async createReport(targetType: 'user' | 'message', targetId: string, reason: string): Promise<boolean> {
    const reporterId = this.auth.authUser()?.id;
    const details = reason.trim();
    if (!reporterId || !targetId || details.length < 5 || details.length > 2000) return false;
    try {
      const { error } = await this.supabase.requireClient().from('reports').insert({
        reporter_id: reporterId, target_type: targetType, target_id: targetId, reason: details
      });
      if (error) throw error;
      this.toast.success('Gracias. El reporte fue enviado al equipo de moderación.');
      return true;
    } catch {
      this.toast.danger('No se pudo enviar el reporte. Inténtalo de nuevo.');
      return false;
    }
  }

  private async loadConversationsForUser(userId: string, version: number): Promise<void> {
    try {
      const { data, error } = await this.supabase.requireClient().rpc('list_conversation_summaries');
      if (error) throw error;
      if (version !== this.conversationLoadVersion || userId !== this.auth.authUser()?.id) return;
      const rows = (data ?? []) as ConversationSummaryRow[];
      const grouped = new Map<string, ChatConversation>();
      for (const row of rows) {
        const existing = grouped.get(row.peer_id);
        if (!existing) {
          grouped.set(row.peer_id, {
            id: row.peer_id,
            requestId: row.session_request_id,
            requestIds: [row.session_request_id],
            conversationIds: [row.conversation_id],
            messageConversationId: row.conversation_id,
            peerId: row.peer_id,
            peerName: row.peer_name,
            peerAvatar: this.avatarUrl(row.peer_avatar_path),
            skillTitle: row.skill_title,
            requestStatus: row.request_status,
            lastMessage: row.last_message,
            lastMessageAt: row.last_message_at ?? '',
            unreadCount: Number(row.unread_count)
          });
        } else {
          existing.requestIds.push(row.session_request_id);
          existing.conversationIds.push(row.conversation_id);
          existing.unreadCount += Number(row.unread_count);
        }
      }
      this.conversationsSignal.set([...grouped.values()]);
    } catch {
      if (version === this.conversationLoadVersion && userId === this.auth.authUser()?.id) {
        this.toast.danger('No se pudieron cargar tus conversaciones. Inténtalo de nuevo.');
      }
    } finally {
      if (version === this.conversationLoadVersion) this.conversationsLoadingSignal.set(false);
    }
  }

  private async markConversationRead(conversationId: string): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId) return;
    const client = this.supabase.requireClient();
    const conversation = this.conversationsSignal().find(item => item.id === conversationId);
    if (!conversation) return;
    const results = await Promise.all(conversation.conversationIds.map(async id => {
      const [readResult, notificationResult] = await Promise.all([
        client.rpc('mark_conversation_read', { p_conversation_id: id }),
        client.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId)
          .is('read_at', null).contains('data', { conversation_id: id })
      ]);
      return readResult.error ?? notificationResult.error;
    }));
    if (results.some(Boolean)) {
      this.toast.warning('No se pudo actualizar el estado de lectura de la conversación.');
      return;
    }
    this.conversationsSignal.update(items => items.map(item => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
  }

  private fromRow(row: MessageRow): ChatMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at,
      deletedAt: row.deleted_at
    };
  }

  private avatarUrl(path: string | null): string {
    if (!path) return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';
    if (/^https?:\/\//i.test(path)) return path;
    return this.supabase.client?.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl ?? '';
  }
}
