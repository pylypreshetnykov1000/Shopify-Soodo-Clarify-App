-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "profile" TEXT,
ADD COLUMN     "profileAt" TIMESTAMP(3),
ADD COLUMN     "scanTotal" INTEGER,
ALTER COLUMN "category" SET DEFAULT 'auto';

-- AlterTable
ALTER TABLE "CatalogProduct" ADD COLUMN     "liveCheck" TEXT,
ADD COLUMN     "liveCheckedAt" TIMESTAMP(3);

