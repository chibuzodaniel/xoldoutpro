-- FanbaseGroup.postPermission default changes from CREATOR_ONLY to ALL_MEMBERS.
-- Existing rows are untouched; this only affects future INSERTs that omit the column.
ALTER TABLE "FanbaseGroup" ALTER COLUMN "postPermission" SET DEFAULT 'ALL_MEMBERS';
