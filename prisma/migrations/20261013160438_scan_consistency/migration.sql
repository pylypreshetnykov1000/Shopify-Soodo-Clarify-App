-- AlterTable
ALTER TABLE "Store" ADD COLUMN "scanRun" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CatalogProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "gid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cacheUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanRun" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "lockToken" TEXT,
    "lockUntil" DATETIME,
    CONSTRAINT "CatalogProduct_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CatalogProduct" ("deleted", "gid", "id", "lockToken", "lockUntil", "payload", "seenAt", "shop", "title") SELECT "deleted", "gid", "id", "lockToken", "lockUntil", "payload", "seenAt", "shop", "title" FROM "CatalogProduct";
DROP TABLE "CatalogProduct";
ALTER TABLE "new_CatalogProduct" RENAME TO "CatalogProduct";
CREATE INDEX "CatalogProduct_shop_deleted_idx" ON "CatalogProduct"("shop", "deleted");
CREATE UNIQUE INDEX "CatalogProduct_shop_gid_key" ON "CatalogProduct"("shop", "gid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
