-- CreateTable
CREATE TABLE "ReadinessSnapshot" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readiness" INTEGER NOT NULL,
    "ready" INTEGER NOT NULL,
    "active" INTEGER NOT NULL,
    "fixes" INTEGER NOT NULL,

    CONSTRAINT "ReadinessSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessSnapshot_shop_day_key" ON "ReadinessSnapshot"("shop", "day");

-- AddForeignKey
ALTER TABLE "ReadinessSnapshot" ADD CONSTRAINT "ReadinessSnapshot_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

