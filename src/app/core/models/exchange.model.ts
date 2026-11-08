export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'rescheduled' | 'cancelled' | 'expired' | 'disputed' | 'completed';
export type ExchangeSessionStatus = 'scheduled' | 'awaiting_confirmation' | 'completed' | 'cancelled' | 'disputed';

export interface ExchangeRequest {
  id: string;
  initiatorId: string;
  requesterId: string;
  requesterName: string;
  requesterAvatar: string;
  providerId: string;
  providerName: string;
  providerAvatar: string;
  skillId: string;
  skillTitle: string;
  message: string;
  proposedStartAt: string;
  requestedHours: number;
  status: RequestStatus;
  createdAt: string;
}

export interface ExchangeSession {
  id: string;
  requestId: string;
  requesterId: string;
  providerId: string;
  partnerId: string;
  partnerName: string;
  partnerAvatar: string;
  skillTitle: string;
  startAt: string;
  meetingUrl: string;
  hours: number;
  status: ExchangeSessionStatus;
  requesterConfirmed: boolean;
  providerConfirmed: boolean;
  reviewSubmitted: boolean;
}

export interface CreditActivity {
  id: string;
  title: string;
  detail: string;
  date: string;
  amount: number;
  type: 'welcome' | 'earned' | 'spent' | 'reserved' | 'refund';
}

export interface ExchangeReview {
  id: string;
  sessionId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  recipientId: string;
  recipientName: string;
  skillTitle: string;
  rating: number;
  comment: string;
  createdAt: string;
}
