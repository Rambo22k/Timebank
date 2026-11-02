export type AppNotificationType =
  | 'session_request'
  | 'request_update'
  | 'session_reminder'
  | 'session_completed'
  | 'credit_activity'
  | 'review_received'
  | 'verification_update'
  | 'solidarity_update'
  | 'report_update'
  | 'system';

export interface AppNotification {
  id: string;
  userId: string;
  type: AppNotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  notification_type: AppNotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}
