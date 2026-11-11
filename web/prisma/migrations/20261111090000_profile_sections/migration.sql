-- Profile sections (v2). Additive only.
ALTER TABLE "User" ADD COLUMN "profileSections" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "profileLocation" TEXT;
