-- AlterTable
ALTER TABLE "CatalogProduct" ADD COLUMN "liveCheck" TEXT;
ALTER TABLE "CatalogProduct" ADD COLUMN "liveCheckedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Store" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL DEFAULT 'auto',
    "syncCursor" TEXT,
    "syncedAt" DATETIME,
    "syncStarted" DATETIME,
    "syncToken" TEXT,
    "syncLease" DATETIME,
    "scanRun" TEXT,
    "scanTotal" INTEGER,
    "profile" TEXT,
    "profileAt" DATETIME
);
INSERT INTO "new_Store" ("category", "scanRun", "shop", "syncCursor", "syncLease", "syncStarted", "syncToken", "syncedAt") SELECT "category", "scanRun", "shop", "syncCursor", "syncLease", "syncStarted", "syncToken", "syncedAt" FROM "Store";
DROP TABLE "Store";
ALTER TABLE "new_Store" RENAME TO "Store";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

