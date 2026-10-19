-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "detailed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderStats" TEXT,
ADD COLUMN     "ordersSync" TEXT,
ADD COLUMN     "ordersSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'description';

-- AlterTable
ALTER TABLE "Change" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'description';

-- CreateTable
CREATE TABLE "AiOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderGid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "assistant" TEXT NOT NULL,
    "touch" TEXT NOT NULL,
    "landingPage" TEXT,

    CONSTRAINT "AiOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiOrder_shop_createdAt_idx" ON "AiOrder"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiOrder_shop_orderGid_key" ON "AiOrder"("shop", "orderGid");

-- AddForeignKey
ALTER TABLE "AiOrder" ADD CONSTRAINT "AiOrder_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

