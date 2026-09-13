export type FeedPostAuthor = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified?: boolean;
};

export type FeedPost = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: FeedPostAuthor;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  followedByMe?: boolean;
};

export type PostComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { handle: string; displayName: string; avatarUrl: string | null };
};

export type FollowedCreator = { id: string; handle: string; displayName: string; avatarUrl: string | null };
