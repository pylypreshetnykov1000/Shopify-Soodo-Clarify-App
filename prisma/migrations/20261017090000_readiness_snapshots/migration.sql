-- CreateTable
CREATE TABLE "ReadinessSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readiness" INTEGER NOT NULL,
    "ready" INTEGER NOT NULL,
    "active" INTEGER NOT NULL,
    "fixes" INTEGER NOT NULL,
    CONSTRAINT "ReadinessSnapshot_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessSnapshot_shop_day_key" ON "ReadinessSnapshot"("shop", "day");

