import { Component } from '@angular/core';
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

@Component({
  selector: 'app-exchange-requests', standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent],
  templateUrl: './requests.page.html', styleUrls: ['./exchanges.page.scss']
})
export class ExchangeRequestsPage {
  direction: 'incoming' | 'outgoing' = 'incoming';
  rescheduleDates: Record<string, string> = {};
  constructor(public exchanges: ExchangeService) { addIcons({ calendarOutline, timeOutline, checkmarkCircleOutline, closeCircleOutline, arrowForwardOutline, addOutline, chatbubbleEllipsesOutline }); }
  get requests() { return this.exchanges.requestsFor(this.direction); }
  setDirection(direction: 'incoming' | 'outgoing') { this.direction = direction; }
  dateFor(requestId: string): string {
    if (!this.rescheduleDates[requestId]) {
      const date = new Date(); date.setDate(date.getDate() + 2); date.setHours(12, 0, 0, 0);
      const pad = (value: number) => String(value).padStart(2, '0');
      this.rescheduleDates[requestId] = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    return this.rescheduleDates[requestId];
  }
}
