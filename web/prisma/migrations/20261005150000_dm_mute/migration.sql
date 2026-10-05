-- Per-person mute for a direct-message conversation.
ALTER TABLE "ConversationParticipant" ADD COLUMN "mutedUntil" TIMESTAMP(3);
