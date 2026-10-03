-- Social activity + reminders now persist in the notification bell.
ALTER TYPE "NotificationKind" ADD VALUE 'FOLLOW';
ALTER TYPE "NotificationKind" ADD VALUE 'LIKE';
ALTER TYPE "NotificationKind" ADD VALUE 'COMMENT';
ALTER TYPE "NotificationKind" ADD VALUE 'FANBASE';
ALTER TYPE "NotificationKind" ADD VALUE 'REMINDER';
