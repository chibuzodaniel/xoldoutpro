-- Opening the bell now marks notifications "seen" (clears the badge)
-- separately from "read" (opened individually). Anything already read
-- counts as already seen.
ALTER TABLE "Notification" ADD COLUMN "seenAt" TIMESTAMP(3);
UPDATE "Notification" SET "seenAt" = "readAt" WHERE "readAt" IS NOT NULL;
