export interface UserProfile {
  id: string;
  name: string;
  email: string;
  headline: string;
  bio: string;
  avatar: string;
  location: string;
  timeCredits: number;
  hoursGiven: number;
  hoursReceived: number;
  completedExchanges: number;
  memberSince: string;
  rating: number;
  reviewsCount: number;
  badges: string[];
}
