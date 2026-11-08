import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline, sendOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ExchangeNavComponent } from './exchange-nav.component';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-exchange-messages', standalone: true,
  imports: [
    TranslatePipe,CommonModule, DatePipe, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent],
  templateUrl: './messages.page.html', styleUrls: ['./messages.page.scss']
})
export class ExchangeMessagesPage {
  chat = inject(ChatService);
  auth = inject(AuthService);

  private readonly destroyRef = inject(DestroyRef);
  draft = '';
  reportTarget: { type: 'user' | 'message'; id: string; label: string } | null = null;
  reportReason = '';
  isSubmittingReport = false;
  isBlockDialogOpen = false;
  isBlocking = false;
  isUnblocking = false;

  constructor() {
    const route = inject(ActivatedRoute);

    addIcons({ chatbubbleEllipsesOutline, sendOutline });
    route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const conversationId = params.get('conversation');
      const requestId = params.get('request');
      void this.openFromLink(conversationId, requestId);
    });
    void this.chat.loadConversations();
  }

  get currentUserId(): string | undefined { return this.auth.authUser()?.id; }

  openUserReport(): void {
    const peer = this.chat.activeConversation();
    if (peer) this.reportTarget = { type: 'user', id: peer.peerId, label: peer.peerName };
  }

  openMessageReport(messageId: string): void {
    this.reportTarget = { type: 'message', id: messageId, label: 'este mensaje' };
  }

  closeReport(): void {
    this.reportTarget = null;
    this.reportReason = '';
  }

  async submitReport(): Promise<void> {
    if (!this.reportTarget || this.reportReason.trim().length < 5 || this.isSubmittingReport) return;
    this.isSubmittingReport = true;
    const target = this.reportTarget;
    try {
      const sent = target.type === 'user'
        ? await this.chat.reportUser(target.id, this.reportReason)
        : await this.chat.reportMessage(target.id, this.reportReason);
      if (sent) this.closeReport();
    } finally {
      this.isSubmittingReport = false;
    }
  }

  async blockPeer(): Promise<void> {
    if (this.isBlocking) return;
    this.isBlocking = true;
    try {
      if (await this.chat.blockActivePeer()) this.isBlockDialogOpen = false;
    } finally {
      this.isBlocking = false;
    }
  }

  async unblockPeer(): Promise<void> {
    if (this.isUnblocking) return;
    this.isUnblocking = true;
    try {
      await this.chat.unblockActivePeer();
    } finally {
      this.isUnblocking = false;
    }
  }

  async send(): Promise<void> {
    const value = this.draft;
    if (!value.trim() || this.chat.isSending()) return;
    if (await this.chat.sendMessage(value)) this.draft = '';
  }

  private async openFromLink(conversationId: string | null, requestId: string | null): Promise<void> {
    if (!conversationId && !requestId) return;
    if (!this.chat.conversations().length || this.chat.isLoadingConversations()) await this.chat.loadConversations();
    const conversation = this.chat.conversations().find(item => conversationId
      ? item.id === conversationId || item.conversationIds.includes(conversationId)
      : !!requestId && item.requestIds.includes(requestId));
    if (conversation) await this.chat.selectConversation(conversation.id);
  }
}
