import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { calendarOutline, timeOutline, checkmarkCircleOutline, warningOutline, closeCircleOutline, starOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ExchangeNavComponent } from './exchange-nav.component';
import { ExchangeService } from '../../core/services/exchange.service';

@Component({ selector: 'app-exchange-sessions', standalone: true, imports: [CommonModule, DatePipe, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent], templateUrl: './sessions.page.html', styleUrls: ['./exchanges.page.scss'] })
export class ExchangeSessionsPage {
  exchanges = inject(ExchangeService);

  constructor() { addIcons({ calendarOutline, timeOutline, checkmarkCircleOutline, warningOutline, closeCircleOutline, starOutline }); }
  get sessions() { return [...this.exchanges.sessionsForCurrentUser()].sort((a,b) => b.startAt.localeCompare(a.startAt)); }
  get upcoming() { return this.sessions.filter(s => s.status === 'scheduled' || s.status === 'awaiting_confirmation'); }
  get history() { return this.sessions.filter(s => s.status === 'completed' || s.status === 'cancelled' || s.status === 'disputed'); }
  get upcomingHours() { return this.upcoming.reduce((sum, session) => sum + session.hours, 0); }
  get completedCount() { return this.history.filter(session => session.status === 'completed').length; }
}
