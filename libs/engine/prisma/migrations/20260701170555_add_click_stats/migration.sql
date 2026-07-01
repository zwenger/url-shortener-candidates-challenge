-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Url" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "longUrl" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Url" ("code", "createdAt", "id", "longUrl", "urlHash") SELECT "code", "createdAt", "id", "longUrl", "urlHash" FROM "Url";
DROP TABLE "Url";
ALTER TABLE "new_Url" RENAME TO "Url";
CREATE UNIQUE INDEX "Url_code_key" ON "Url"("code");
CREATE UNIQUE INDEX "Url_urlHash_key" ON "Url"("urlHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
