-- CreateTable
CREATE TABLE "VisibilityTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "assistant" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "leaseUntil" DATETIME,
    "total" INTEGER NOT NULL,
    "score" INTEGER,
    "error" TEXT,
    CONSTRAINT "VisibilityTest_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisibilityAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "VisibilityAnswer_testId_fkey" FOREIGN KEY ("testId") REFERENCES "VisibilityTest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VisibilityTest_shop_createdAt_idx" ON "VisibilityTest"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "VisibilityAnswer_testId_status_idx" ON "VisibilityAnswer"("testId", "status");
