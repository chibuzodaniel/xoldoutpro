-- AlterEnum
ALTER TYPE "BillboardStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "BillboardStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'BILLBOARD_REFUND';

-- AlterTable
ALTER TABLE "Billboard" ADD COLUMN     "rejectionReason" TEXT;
