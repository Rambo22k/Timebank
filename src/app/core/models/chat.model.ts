export interface ChatConversation {
  id: string;
  requestId: string;
  requestIds: string[];
  conversationIds: string[];
  messageConversationId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  skillTitle: string;
  requestStatus: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ConversationSummaryRow {
  conversation_id: string;
  session_request_id: string;
  peer_id: string;
  peer_name: string;
  peer_avatar_path: string | null;
  skill_title: string;
  request_status: string;
  last_message: string;
  last_message_at: string | null;
  unread_count: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
}
