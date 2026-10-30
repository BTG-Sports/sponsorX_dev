-- POL-BE-36 — BTG's payments switch: one platform-wide row, changed from the admin screen.
CREATE TABLE "PaymentSwitch" (
    "id" TEXT NOT NULL DEFAULT 'payments',
    "open" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,
    "changedByEmail" TEXT,

    CONSTRAINT "PaymentSwitch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentSwitch_one_row" CHECK ("id" = 'payments'),
    CONSTRAINT "PaymentSwitch_reason_check" CHECK (length(btrim("reason")) > 0)
);
