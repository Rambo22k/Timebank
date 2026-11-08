import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { calendarOutline, timeOutline, checkmarkCircleOutline, closeCircleOutline, arrowForwardOutline, addOutline, chatbubbleEllipsesOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ExchangeNavComponent } from './exchange-nav.component';
import { ExchangeService } from '../../core/services/exchange.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { tomorrowAtNoonInZone, zonedDateTimeToIso } from '../../core/utils/zoned-date-time';

@Component({
  selector: 'app-exchange-requests', standalone: true,
  imports: [
    TranslatePipe,CommonModule, DatePipe, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent],
  templateUrl: './requests.page.html', styleUrls: ['./exchanges.page.scss']
})
export class ExchangeRequestsPage {
  exchanges = inject(ExchangeService);

  direction: 'incoming' | 'outgoing' = 'incoming';
  rescheduleDates: Record<string, string> = {};
  constructor() { addIcons({ calendarOutline, timeOutline, checkmarkCircleOutline, closeCircleOutline, arrowForwardOutline, addOutline, chatbubbleEllipsesOutline }); }
  get requests() { return this.exchanges.requestsFor(this.direction); }
  setDirection(direction: 'incoming' | 'outgoing') { this.direction = direction; }
  dateFor(requestId: string): string {
    if (!this.rescheduleDates[requestId]) {
      this.rescheduleDates[requestId] = tomorrowAtNoonInZone(this.exchanges.currentTimezone, 2);
    }
    return this.rescheduleDates[requestId];
  }
  reschedule(requestId: string): void {
    const iso = zonedDateTimeToIso(this.dateFor(requestId), this.exchanges.currentTimezone);
    this.exchanges.rescheduleRequest(requestId, iso ?? '');
  }
}
