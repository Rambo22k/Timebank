import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
    TranslatePipe,CommonModule, DatePipe, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent], templateUrl: './wallet.page.html', styleUrls: ['./exchanges.page.scss'] })
export class WalletPage {
  exchanges = inject(ExchangeService);

  constructor() {
    addIcons({ timeOutline, trendingUpOutline, trendingDownOutline, giftOutline, calendarOutline, arrowForwardOutline });
    void this.exchanges.loadWalletActivity();
  }
  get earned() { return this.exchanges.activity().filter(tx => tx.type === 'earned').reduce((sum, tx) => sum + tx.amount, 0); }
  get spent() { return Math.abs(this.exchanges.activity().filter(tx => tx.type === 'spent').reduce((sum, tx) => sum + tx.amount, 0)); }
  get reserved() { return this.exchanges.reservedBalance(); }
  get activity() { return [...this.exchanges.activity()].sort((a,b) => b.date.localeCompare(a.date)); }
  icon(type: string) { return type === 'welcome' ? 'gift-outline' : type === 'earned' ? 'trending-up-outline' : type === 'refund' ? 'time-outline' : 'trending-down-outline'; }
}
