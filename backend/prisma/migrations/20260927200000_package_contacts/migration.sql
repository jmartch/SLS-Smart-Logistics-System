-- Sender/recipient contact snapshot on Package, agreed with Santiago's
-- package-registration spec: name and phone required, email optional,
-- for both sender and recipient.
ALTER TABLE "Package"
  ADD COLUMN "senderName" TEXT,
  ADD COLUMN "senderPhone" TEXT,
  ADD COLUMN "senderEmail" TEXT,
  ADD COLUMN "recipientName" TEXT,
  ADD COLUMN "recipientPhone" TEXT,
  ADD COLUMN "recipientEmail" TEXT;

-- The Package table has no rows on any environment that has run only the
-- migrations up to this point, so backfill is a no-op safety net rather
-- than a real data migration.
UPDATE "Package" SET
  "senderName" = COALESCE("senderName", ''),
  "senderPhone" = COALESCE("senderPhone", ''),
  "recipientName" = COALESCE("recipientName", ''),
  "recipientPhone" = COALESCE("recipientPhone", '');

ALTER TABLE "Package"
  ALTER COLUMN "senderName" SET NOT NULL,
  ALTER COLUMN "senderPhone" SET NOT NULL,
  ALTER COLUMN "recipientName" SET NOT NULL,
  ALTER COLUMN "recipientPhone" SET NOT NULL;
