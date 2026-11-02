import { Component } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { starOutline, star, chatbubbleEllipsesOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ExchangeNavComponent } from './exchange-nav.component';
import { ExchangeService } from '../../core/services/exchange.service';

@Component({ selector: 'app-exchange-reviews', standalone: true, imports: [CommonModule, DatePipe, FormsModule, IonIcon, NavbarComponent, FooterComponent, ExchangeNavComponent], templateUrl: './reviews.page.html', styleUrls: ['./exchanges.page.scss'] })
export class ExchangeReviewsPage {
  ratings: Record<string, number> = {};
  comments: Record<string, string> = {};
  submitting = new Set<string>();
  readonly stars = [1, 2, 3, 4, 5];
  constructor(public exchanges: ExchangeService) {
    addIcons({ starOutline, star, chatbubbleEllipsesOutline, checkmarkCircleOutline });
    void this.exchanges.loadRequests();
    void this.exchanges.loadReviews();
  }
  get pending() { return this.exchanges.pendingReviews(); }
  get received() { return this.exchanges.reviewsForCurrentUser(); }
  setRating(sessionId: string, rating: number) { this.ratings[sessionId] = rating; }
  async submit(sessionId: string) {
    if (this.submitting.has(sessionId)) return;
    this.submitting.add(sessionId);
    try {
      await this.exchanges.submitReview(sessionId, this.ratings[sessionId] || 0, this.comments[sessionId] || '');
    } finally {
      this.submitting.delete(sessionId);
    }
  }
}
