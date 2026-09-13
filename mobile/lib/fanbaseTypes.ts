export type GroupRole = "ADMIN" | "MEMBER";
export type GroupVisibility = "OPEN" | "REQUEST_TO_JOIN";
export type PostPermission = "CREATOR_ONLY" | "ADMINS" | "ALL_MEMBERS";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type FanbaseGroup = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: GroupVisibility;
  creatorId: string;
  creator: { displayName: string; isVerified?: boolean };
  memberCount: number;
  myRole: GroupRole | null;
  lastActivityAt: string | null;
  lastMessage: { senderName: string; body: string } | null;
  unreadCount: number;
  joinRequestPending: boolean;
  isVerified: boolean;
};

export type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: GroupVisibility;
  postPermission: PostPermission;
  creator: { handle: string; displayName: string };
  creatorId: string;
  memberCount: number;
  isVerified: boolean;
  verificationRequestedAt: string | null;
};

export type ChatMessageAuthor = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
};

export type ChatMessage = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: ChatMessageAuthor;
  replyTo: { id: string; body: string; author: { displayName: string } } | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  poll: { options: string[]; counts: number[]; myVote: number | null; totalVotes: number } | null;
};

export type GroupMember = {
  role: GroupRole;
  joinedAt: string;
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null };
};

export type JoinRequestRow = {
  id: string;
  createdAt: string;
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null };
};
