import { ListUrlsUseCase } from "../application/list-urls";
import { RecordClickUseCase } from "../application/record-click";
import { ResolveUrlUseCase } from "../application/resolve-url";
import {
  DEFAULT_LENGTH as DEFAULT_SHORT_CODE_LENGTH,
  ShortCodeGenerator,
} from "../application/short-code-generator";
import { ShortenUrlUseCase } from "../application/shorten-url";
import type { UrlRepository } from "../domain/url-repository";
import type { CacheConfig } from "./caching-url-repository";
import { CachingUrlRepository } from "./caching-url-repository";
import { getPrismaClient } from "./prisma-client";
import { PrismaUrlRepository } from "./prisma-url-repository";

const DEFAULT_CACHE_MAX_ENTRIES = 1000;
const DEFAULT_CACHE_TTL_MS = 300_000;

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  // `lru-cache` requires a non-negative integer for both `max` and `ttl`
  // (a negative or fractional value throws at construction time). Reject
  // anything that isn't a non-negative integer here so a bad env value
  // degrades to the safe default instead of crashing the app at boot.
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  // A short-code length must be a positive integer; a zero/negative/fractional
  // value would produce empty or malformed codes. Degrade to the safe default
  // instead of generating broken codes.
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function readCacheConfigFromEnv(): CacheConfig {
  return {
    maxEntries: readIntEnv("CACHE_MAX_ENTRIES", DEFAULT_CACHE_MAX_ENTRIES),
    ttlMs: readIntEnv("CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS),
  };
}

export interface Engine {
  shortenUrl: (rawUrl: string) => ReturnType<ShortenUrlUseCase["execute"]>;
  resolveUrl: (code: string) => ReturnType<ResolveUrlUseCase["execute"]>;
  recordClick: (code: string) => ReturnType<RecordClickUseCase["execute"]>;
  listUrls: () => ReturnType<ListUrlsUseCase["execute"]>;
}

export interface EngineDeps {
  repository?: UrlRepository;
}

function buildRepository(base: UrlRepository): UrlRepository {
  try {
    return new CachingUrlRepository(base, readCacheConfigFromEnv());
  } catch (error) {
    // Belt-and-suspenders: even with `readIntEnv` sanitizing config values,
    // caching must never be able to break the app. If construction fails
    // for any reason, degrade to the uncached base repository rather than
    // letting createEngine() (called eagerly at boot) throw.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `CachingUrlRepository construction failed, falling back to uncached repository (${message})`,
    );
    return base;
  }
}

export function createEngine(deps: EngineDeps = {}): Engine {
  const base = deps.repository ?? new PrismaUrlRepository(getPrismaClient());
  // An injected repository (tests/fakes) is always used uncached and
  // unwrapped — determinism for tests matters more than caching there. Only
  // the default Prisma repository is wrapped with the caching decorator.
  const repository = deps.repository ? base : buildRepository(base);
  // `SHORT_CODE_LENGTH` is read here, at the composition root, and passed
  // explicitly into the generator — the application layer must not touch env.
  const shortCodeLength = readPositiveIntEnv(
    "SHORT_CODE_LENGTH",
    DEFAULT_SHORT_CODE_LENGTH,
  );
  const generator = new ShortCodeGenerator(repository, shortCodeLength);
  const shortenUrlUseCase = new ShortenUrlUseCase(repository, generator);
  const resolveUrlUseCase = new ResolveUrlUseCase(repository);
  const recordClickUseCase = new RecordClickUseCase(repository);
  const listUrlsUseCase = new ListUrlsUseCase(repository);

  return {
    shortenUrl: (rawUrl: string) => shortenUrlUseCase.execute(rawUrl),
    resolveUrl: (code: string) => resolveUrlUseCase.execute(code),
    recordClick: (code: string) => recordClickUseCase.execute(code),
    listUrls: () => listUrlsUseCase.execute(),
  };
}
