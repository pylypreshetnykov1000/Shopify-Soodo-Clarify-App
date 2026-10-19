-- CreateTable
CREATE TABLE "AiOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderGid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "assistant" TEXT NOT NULL,
    "touch" TEXT NOT NULL,
    "landingPage" TEXT,
    CONSTRAINT "AiOrder_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "profileAt" DATETIME,
    "detailed" BOOLEAN NOT NULL DEFAULT false,
    "ordersSync" TEXT,
    "orderStats" TEXT,
    "ordersSyncedAt" DATETIME
);
INSERT INTO "new_Store" ("category", "profile", "profileAt", "scanRun", "scanTotal", "shop", "syncCursor", "syncLease", "syncStarted", "syncToken", "syncedAt") SELECT "category", "profile", "profileAt", "scanRun", "scanTotal", "shop", "syncCursor", "syncLease", "syncStarted", "syncToken", "syncedAt" FROM "Store";
DROP TABLE "Store";
ALTER TABLE "new_Store" RENAME TO "Store";
CREATE TABLE "new_Suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'description',
    "fingerprint" TEXT NOT NULL,
    "beforeHtml" TEXT NOT NULL,
    "afterHtml" TEXT NOT NULL,
    "facts" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Suggestion" ("afterHtml", "beforeHtml", "createdAt", "facts", "fingerprint", "id", "productId", "status") SELECT "afterHtml", "beforeHtml", "createdAt", "facts", "fingerprint", "id", "productId", "status" FROM "Suggestion";
DROP TABLE "Suggestion";
ALTER TABLE "new_Suggestion" RENAME TO "Suggestion";
CREATE INDEX "Suggestion_productId_status_idx" ON "Suggestion"("productId", "status");
CREATE TABLE "new_Change" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'description',
    "suggestionId" TEXT NOT NULL,
    "beforeHtml" TEXT NOT NULL,
    "afterHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHING',
    "requestOutcome" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Change_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Change_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Change" ("afterHtml", "beforeHtml", "createdAt", "id", "message", "productId", "requestOutcome", "status", "suggestionId", "updatedAt") SELECT "afterHtml", "beforeHtml", "createdAt", "id", "message", "productId", "requestOutcome", "status", "suggestionId", "updatedAt" FROM "Change";
DROP TABLE "Change";
ALTER TABLE "new_Change" RENAME TO "Change";
CREATE INDEX "Change_productId_status_idx" ON "Change"("productId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AiOrder_shop_createdAt_idx" ON "AiOrder"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiOrder_shop_orderGid_key" ON "AiOrder"("shop", "orderGid");

