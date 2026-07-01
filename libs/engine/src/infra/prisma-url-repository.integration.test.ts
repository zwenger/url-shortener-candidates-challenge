import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaUrlRepository } from "./prisma-url-repository";

const engineRoot = resolve(import.meta.dirname, "../..");
const dbFile = resolve(engineRoot, "prisma/test-integration.db");
const databaseUrl = `file:${dbFile}?socket_timeout=15`;

let prisma: PrismaClient;
let repository: PrismaUrlRepository;

beforeAll(() => {
  if (existsSync(dbFile)) {
    rmSync(dbFile);
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: engineRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  repository = new PrismaUrlRepository(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(dbFile)) {
    rmSync(dbFile);
  }
  const journal = `${dbFile}-journal`;
  if (existsSync(journal)) {
    rmSync(journal);
  }
});

describe("PrismaUrlRepository", () => {
  it("persists a new record on create", async () => {
    const created = await repository.create({
      code: "AbC1234",
      longUrl: "https://example.com/a",
      urlHash: "hash-a",
    });

    expect(created.code).toBe("AbC1234");
    expect(created.longUrl).toBe("https://example.com/a");
    expect(created.urlHash).toBe("hash-a");
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it("finds a record by code", async () => {
    await repository.create({
      code: "FindCod",
      longUrl: "https://example.com/find-by-code",
      urlHash: "hash-find-code",
    });

    const found = await repository.findByCode("FindCod");

    expect(found?.longUrl).toBe("https://example.com/find-by-code");
  });

  it("finds a record by hash", async () => {
    await repository.create({
      code: "FindHsh",
      longUrl: "https://example.com/find-by-hash",
      urlHash: "hash-find-hash",
    });

    const found = await repository.findByHash("hash-find-hash");

    expect(found?.code).toBe("FindHsh");
  });

  it("returns null when nothing matches", async () => {
    expect(await repository.findByCode("missing")).toBeNull();
    expect(await repository.findByHash("missing")).toBeNull();
  });

  it("reports existsByCode correctly", async () => {
    await repository.create({
      code: "ExistYs",
      longUrl: "https://example.com/exists",
      urlHash: "hash-exists",
    });

    expect(await repository.existsByCode("ExistYs")).toBe(true);
    expect(await repository.existsByCode("NoneNon")).toBe(false);
  });

  it("surfaces a unique constraint violation on duplicate code catchably", async () => {
    await repository.create({
      code: "DupeCod",
      longUrl: "https://example.com/first",
      urlHash: "hash-dupe-code-1",
    });

    await expect(
      repository.create({
        code: "DupeCod",
        longUrl: "https://example.com/second",
        urlHash: "hash-dupe-code-2",
      }),
    ).rejects.toThrow();
  });

  it("surfaces a unique constraint violation on duplicate urlHash catchably", async () => {
    await repository.create({
      code: "HashOne",
      longUrl: "https://example.com/hash-one",
      urlHash: "hash-dupe-shared",
    });

    await expect(
      repository.create({
        code: "HashTwo",
        longUrl: "https://example.com/hash-two",
        urlHash: "hash-dupe-shared",
      }),
    ).rejects.toThrow();
  });

  it("creates a record with default clickCount 0 and lastClickedAt null", async () => {
    const created = await repository.create({
      code: "ClickDf",
      longUrl: "https://example.com/click-defaults",
      urlHash: "hash-click-defaults",
    });

    expect(created.clickCount).toBe(0);
    expect(created.lastClickedAt).toBeNull();
  });

  it("increments clickCount and sets lastClickedAt atomically", async () => {
    await repository.create({
      code: "IncOne1",
      longUrl: "https://example.com/increment-one",
      urlHash: "hash-increment-one",
    });

    await repository.incrementClicks("IncOne1");
    const found = await repository.findByCode("IncOne1");

    expect(found?.clickCount).toBe(1);
    expect(found?.lastClickedAt).toBeInstanceOf(Date);
  });

  it("compounds two sequential increments to clickCount 2", async () => {
    await repository.create({
      code: "IncTwo2",
      longUrl: "https://example.com/increment-two",
      urlHash: "hash-increment-two",
    });

    await repository.incrementClicks("IncTwo2");
    await repository.incrementClicks("IncTwo2");
    const found = await repository.findByCode("IncTwo2");

    expect(found?.clickCount).toBe(2);
  });

  it("throws a P2025 error when incrementClicks targets a missing code", async () => {
    await expect(repository.incrementClicks("missing")).rejects.toMatchObject({
      code: "P2025",
    });
  });

  it("returns records from listAll ordered by createdAt descending", async () => {
    const first = await repository.create({
      code: "ListOne1",
      longUrl: "https://example.com/list-one",
      urlHash: "hash-list-one",
    });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    const second = await repository.create({
      code: "ListTwo2",
      longUrl: "https://example.com/list-two",
      urlHash: "hash-list-two",
    });

    const all = await repository.listAll();
    const codes = all.map((url) => url.code);

    expect(codes.indexOf(second.code)).toBeLessThan(codes.indexOf(first.code));
  });
});
