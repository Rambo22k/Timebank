export type SolidarityRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface SolidarityFundSummary {
  availableCredits: number;
  lifetimeDonatedCredits: number;
  approvedRequests: number;
  peopleHelped: number;
}

export interface SolidarityRequest {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  hoursRequested: number;
  status: SolidarityRequestStatus;
  resolutionNote: string | null;
  createdAt: string;
}

export interface SolidarityDonation {
  id: string;
  amount: number;
  categoryName: string | null;
  createdAt: string;
}

export interface SolidarityCategory {
  id: string;
  name: string;
}

export interface SolidarityDonationTarget {
  requestId: string;
  publicSummary: string;
  requestedCredits: number;
  receivedCredits: number;
  remainingCredits: number;
  createdAt: string;
}
