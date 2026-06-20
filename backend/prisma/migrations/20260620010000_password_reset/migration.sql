ALTER TABLE "User"
ADD COLUMN "passwordResetHash" TEXT,
ADD COLUMN "passwordResetExpiry" TIMESTAMP(3);
