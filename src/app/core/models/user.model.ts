export interface UserProfile {
  id: string;
  name: string;
  email: string;
  headline: string;
  bio: string;
  avatar: string;
  location: string;
  countryCode: string;
  timezone: string;
  languages: string[];
  preferredLanguage: 'en' | 'es';
  timeCredits: number;
  hoursGiven: number;
  hoursReceived: number;
  completedExchanges: number;
  memberSince: string;
  rating: number;
  reviewsCount: number;
  badges: string[];
  isVerified: boolean;
}
