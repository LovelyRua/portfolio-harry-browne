ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "verificationHash" TEXT,
ADD COLUMN "verificationExpiry" TIMESTAMP(3),
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Accounts created before email verification existed remain usable.
UPDATE "User"
SET "emailVerifiedAt" = "updatedAt"
WHERE "emailVerifiedAt" IS NULL;
