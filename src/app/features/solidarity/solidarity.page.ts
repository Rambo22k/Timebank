import { Component } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { heartOutline, giftOutline, peopleOutline, timeOutline, refreshOutline, checkmarkCircleOutline, closeCircleOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ExchangeNavComponent } from '../exchanges/exchange-nav.component';
import { SolidarityService } from '../../core/services/solidarity.service';
import { SolidarityRequestStatus } from '../../core/models/solidarity.model';

@Component({
  selector: 'app-solidarity', standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent],
  templateUrl: './solidarity.page.html', styleUrls: ['./solidarity.page.scss']
})
export class SolidarityPage {
  donationAmount = 1;
  donationCategoryId = '';
  requestReason = '';
  requestHours = 1;
  adminNotes: Record<string, string> = {};

  constructor(public solidarity: SolidarityService) {
    addIcons({ heartOutline, giftOutline, peopleOutline, timeOutline, refreshOutline, checkmarkCircleOutline, closeCircleOutline });
  }

  async donate(): Promise<void> {
    if (this.donationAmount > this.solidarity.availableBalance()) return;
    const result = await this.solidarity.donate(this.donationAmount, this.donationCategoryId || null);
    if (result) { this.donationAmount = 1; this.donationCategoryId = ''; }
  }

  async requestSupport(): Promise<void> {
    const result = await this.solidarity.createRequest(this.requestReason, this.requestHours);
    if (result) { this.requestReason = ''; this.requestHours = 1; }
  }

  async resolve(requestId: string, approve: boolean): Promise<void> {
    await this.solidarity.resolveRequest(requestId, approve, this.adminNotes[requestId] ?? '');
  }

  statusLabel(status: SolidarityRequestStatus): string {
    return ({ pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada' } as const)[status];
  }
}
