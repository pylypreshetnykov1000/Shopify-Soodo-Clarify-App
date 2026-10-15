-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "shop" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'outdoor',
    "syncCursor" TEXT,
    "syncedAt" TIMESTAMP(3),
    "syncStarted" TIMESTAMP(3),
    "syncToken" TEXT,
    "syncLease" TIMESTAMP(3),
    "scanRun" TEXT,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "gid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cacheUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanRun" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "lockToken" TEXT,
    "lockUntil" TIMESTAMP(3),

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "beforeHtml" TEXT NOT NULL,
    "afterHtml" TEXT NOT NULL,
    "facts" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "beforeHtml" TEXT NOT NULL,
    "afterHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHING',
    "requestOutcome" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogProduct_shop_deleted_idx" ON "CatalogProduct"("shop", "deleted");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_shop_gid_key" ON "CatalogProduct"("shop", "gid");

-- CreateIndex
CREATE INDEX "Suggestion_productId_status_idx" ON "Suggestion"("productId", "status");

-- CreateIndex
CREATE INDEX "Change_productId_status_idx" ON "Change"("productId", "status");

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Store"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "Suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
