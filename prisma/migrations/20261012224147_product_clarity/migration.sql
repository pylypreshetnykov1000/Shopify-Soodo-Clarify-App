-- CreateTable
CREATE TABLE "Store" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL DEFAULT 'outdoor',
    "syncCursor" TEXT,
    "syncedAt" DATETIME,
    "syncStarted" DATETIME,
    "syncToken" TEXT,
    "syncLease" DATETIME
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "gid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "lockToken" TEXT,
    "lockUntil" DATETIME,
    CONSTRAINT "CatalogProduct_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store" ("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "beforeHtml" TEXT NOT NULL,
    "afterHtml" TEXT NOT NULL,
    "facts" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Suggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "beforeHtml" TEXT NOT NULL,
    "afterHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHING',
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Change_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Change_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CatalogProduct_shop_deleted_idx" ON "CatalogProduct"("shop", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_shop_gid_key" ON "CatalogProduct"("shop", "gid");

-- CreateIndex
CREATE INDEX "Suggestion_productId_status_idx" ON "Suggestion"("productId", "status");

-- CreateIndex
CREATE INDEX "Change_productId_status_idx" ON "Change"("productId", "status");
