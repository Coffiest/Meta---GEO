-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "startingStack" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentEntry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "finishPosition" INTEGER,
    "bustedAtHandNumber" INTEGER,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hand" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "handNumber" INTEGER NOT NULL,
    "levelSmallBlind" INTEGER NOT NULL,
    "levelBigBlind" INTEGER NOT NULL,
    "levelAnte" INTEGER NOT NULL,
    "buttonFixedPos" INTEGER NOT NULL,
    "board" TEXT[],
    "potTotal" INTEGER NOT NULL,
    "wonByFold" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandSeat" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "startingStack" INTEGER NOT NULL,
    "holeCards" TEXT[],
    "isSmallBlind" BOOLEAN NOT NULL DEFAULT false,
    "isBigBlind" BOOLEAN NOT NULL DEFAULT false,
    "resultStackDelta" INTEGER NOT NULL,

    CONSTRAINT "HandSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandAction" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "street" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toAmount" INTEGER,
    "potBefore" INTEGER NOT NULL,

    CONSTRAINT "HandAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandPot" (
    "id" TEXT NOT NULL,
    "handId" TEXT NOT NULL,
    "potIndex" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "eligibleUserIds" TEXT[],
    "winnerUserIds" TEXT[],

    CONSTRAINT "HandPot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "TournamentEntry_userId_idx" ON "TournamentEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_tournamentId_seatIndex_key" ON "TournamentEntry"("tournamentId", "seatIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Hand_tournamentId_handNumber_key" ON "Hand"("tournamentId", "handNumber");

-- CreateIndex
CREATE INDEX "HandSeat_userId_idx" ON "HandSeat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HandSeat_handId_seatIndex_key" ON "HandSeat"("handId", "seatIndex");

-- CreateIndex
CREATE INDEX "HandAction_handId_sequenceNumber_idx" ON "HandAction"("handId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "HandAction_street_kind_idx" ON "HandAction"("street", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "HandPot_handId_potIndex_key" ON "HandPot"("handId", "potIndex");

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hand" ADD CONSTRAINT "Hand_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandSeat" ADD CONSTRAINT "HandSeat_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandSeat" ADD CONSTRAINT "HandSeat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandAction" ADD CONSTRAINT "HandAction_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandPot" ADD CONSTRAINT "HandPot_handId_fkey" FOREIGN KEY ("handId") REFERENCES "Hand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
