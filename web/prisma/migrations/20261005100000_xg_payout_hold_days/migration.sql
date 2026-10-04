-- Days received Live XG is held before it is paid into the wallet (default 7),
-- super-moderator editable; replaces the original once-a-month payout.
ALTER TABLE "PlatformSettings" ADD COLUMN "xgPayoutHoldDays" INTEGER NOT NULL DEFAULT 7;
