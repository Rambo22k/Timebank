import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { timeOutline, trendingUpOutline, trendingDownOutline, giftOutline, calendarOutline, arrowForwardOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ExchangeNavComponent } from './exchange-nav.component';
import { ExchangeService } from '../../core/services/exchange.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({ selector: 'app-time-wallet', standalone: true, imports: [
    TranslatePipe,CommonModule, DatePipe, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent], templateUrl: './wallet.page.html', styleUrls: ['./exchanges.page.scss'] })
export class WalletPage {
  exchanges = inject(ExchangeService);
  typeFilter: 'all' | 'welcome' | 'earned' | 'spent' | 'reserved' | 'refund' = 'all';
  dateFrom = '';
  dateTo = '';

  constructor() {
    addIcons({ timeOutline, trendingUpOutline, trendingDownOutline, giftOutline, calendarOutline, arrowForwardOutline });
    void this.exchanges.loadWalletActivity();
  }
  get earned() { return this.exchanges.activity().filter(tx => tx.type === 'earned').reduce((sum, tx) => sum + tx.amount, 0); }
  get spent() { return Math.abs(this.exchanges.activity().filter(tx => tx.type === 'spent').reduce((sum, tx) => sum + tx.amount, 0)); }
  get reserved() { return this.exchanges.reservedBalance(); }
  get timeNetwork() {
    const requests = new Map(this.exchanges.requests().map(request => [request.id, request]));
    const edges = new Map<string, { helper: string; learner: string; sessions: number; hours: number }>();
    for (const session of this.exchanges.sessionsForCurrentUser()) {
      if (session.status !== 'completed') continue;
      const request = requests.get(session.requestId);
      if (!request) continue;
      const key = `${request.providerId}:${request.requesterId}`;
      const edge = edges.get(key) ?? { helper: request.providerName, learner: request.requesterName, sessions: 0, hours: 0 };
      edge.sessions += 1;
      edge.hours += session.hours;
      edges.set(key, edge);
    }
    return [...edges.values()].sort((a, b) => b.hours - a.hours || b.sessions - a.sessions);
  }
  get networkHours() { return this.timeNetwork.reduce((total, edge) => total + edge.hours, 0); }
  get activity() { return [...this.exchanges.activity()].sort((a,b) => b.date.localeCompare(a.date)); }
  get filteredActivity() {
    return this.activity.filter(tx => {
      if (this.typeFilter !== 'all' && tx.type !== this.typeFilter) return false;
      const localDate = this.dateInUserTimezone(tx.date);
      return (!this.dateFrom || localDate >= this.dateFrom) && (!this.dateTo || localDate <= this.dateTo);
    });
  }
  get hasFilters(): boolean { return this.typeFilter !== 'all' || !!this.dateFrom || !!this.dateTo; }
  clearFilters(): void { this.typeFilter = 'all'; this.dateFrom = ''; this.dateTo = ''; }
  icon(type: string) { return type === 'welcome' ? 'gift-outline' : type === 'earned' ? 'trending-up-outline' : type === 'refund' ? 'time-outline' : 'trending-down-outline'; }

  private dateInUserTimezone(value: string): string {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: this.exchanges.currentTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
      return `${parts['year']}-${parts['month']}-${parts['day']}`;
    } catch {
      return value.slice(0, 10);
    }
  }
}
