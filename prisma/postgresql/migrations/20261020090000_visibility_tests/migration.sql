-- CreateTable
CREATE TABLE "VisibilityTest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "assistant" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "total" INTEGER NOT NULL,
    "score" INTEGER,
    "error" TEXT,

    CONSTRAINT "VisibilityTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisibilityAnswer" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appearance" TEXT,
    "products" TEXT NOT NULL DEFAULT '[]',
    "brands" TEXT NOT NULL DEFAULT '[]',
    "sources" TEXT NOT NULL DEFAULT '[]',
    "answer" TEXT,
    "error" TEXT,

    CONSTRAINT "VisibilityAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisibilityTest_shop_createdAt_idx" ON "VisibilityTest"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "VisibilityAnswer_testId_status_idx" ON "VisibilityAnswer"("testId", "status");

-- AddForeignKey
ALTER TABLE "VisibilityTest" ADD CONSTRAINT "VisibilityTest_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisibilityAnswer" ADD CONSTRAINT "VisibilityAnswer_testId_fkey" FOREIGN KEY ("testId") REFERENCES "VisibilityTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
