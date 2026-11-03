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

@Component({
  selector: 'app-exchange-messages', standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent],
  templateUrl: './messages.page.html', styleUrls: ['./messages.page.scss']
})
export class ExchangeMessagesPage {
  private readonly destroyRef = inject(DestroyRef);
  draft = '';

  constructor(
    public chat: ChatService,
    public auth: AuthService,
    route: ActivatedRoute
  ) {
    addIcons({ chatbubbleEllipsesOutline, sendOutline });
    route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const conversationId = params.get('conversation');
      const requestId = params.get('request');
      void this.openFromLink(conversationId, requestId);
    });
    void this.chat.loadConversations();
  }

  get currentUserId(): string | undefined { return this.auth.authUser()?.id; }

  async send(): Promise<void> {
    const value = this.draft;
    if (!value.trim() || this.chat.isSending()) return;
    if (await this.chat.sendMessage(value)) this.draft = '';
  }

  private async openFromLink(conversationId: string | null, requestId: string | null): Promise<void> {
    if (!conversationId && !requestId) return;
    if (!this.chat.conversations().length || this.chat.isLoadingConversations()) await this.chat.loadConversations();
    const conversation = this.chat.conversations().find(item =>
      conversationId ? item.id === conversationId : item.requestId === requestId
    );
    if (conversation) await this.chat.selectConversation(conversation.id);
  }
}
