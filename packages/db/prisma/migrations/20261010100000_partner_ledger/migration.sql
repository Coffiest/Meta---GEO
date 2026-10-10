-- インフルエンサーのコードで始まった契約・報酬の台帳・振込。
CREATE TABLE "PartnerReferral" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "userId" TEXT,
    "selfReferral" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerReferral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerReferral_stripeSubscriptionId_key" ON "PartnerReferral"("stripeSubscriptionId");
CREATE INDEX "PartnerReferral_partnerId_idx" ON "PartnerReferral"("partnerId");

CREATE TABLE "PartnerLedger" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripeChargeId" TEXT,
    "paymentIndex" INTEGER NOT NULL,
    "plan" TEXT,
    "amount" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "voidReason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerLedger_sourceId_key" ON "PartnerLedger"("sourceId");
CREATE INDEX "PartnerLedger_partnerId_occurredAt_idx" ON "PartnerLedger"("partnerId", "occurredAt");
CREATE INDEX "PartnerLedger_stripeChargeId_idx" ON "PartnerLedger"("stripeChargeId");
CREATE INDEX "PartnerLedger_payoutId_idx" ON "PartnerLedger"("payoutId");

CREATE TABLE "PartnerPayout" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "closedBefore" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerPayout_partnerId_idx" ON "PartnerPayout"("partnerId");
