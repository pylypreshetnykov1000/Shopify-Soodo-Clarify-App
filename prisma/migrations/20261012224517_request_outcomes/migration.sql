-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Change" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
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
INSERT INTO "new_Change" ("afterHtml", "beforeHtml", "createdAt", "id", "message", "productId", "status", "suggestionId", "updatedAt") SELECT "afterHtml", "beforeHtml", "createdAt", "id", "message", "productId", "status", "suggestionId", "updatedAt" FROM "Change";
DROP TABLE "Change";
ALTER TABLE "new_Change" RENAME TO "Change";
CREATE INDEX "Change_productId_status_idx" ON "Change"("productId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
