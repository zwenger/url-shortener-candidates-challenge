-- CreateTable
CREATE TABLE "Url" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "longUrl" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Url_code_key" ON "Url"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Url_urlHash_key" ON "Url"("urlHash");

-- CreateIndex
CREATE INDEX "Url_urlHash_idx" ON "Url"("urlHash");
