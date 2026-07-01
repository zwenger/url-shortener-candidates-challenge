import { ListUrlsUseCase } from "../application/list-urls";
import { RecordClickUseCase } from "../application/record-click";
import { ResolveUrlUseCase } from "../application/resolve-url";
import { ShortCodeGenerator } from "../application/short-code-generator";
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
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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

export function createEngine(deps: EngineDeps = {}): Engine {
  const base = deps.repository ?? new PrismaUrlRepository(getPrismaClient());
  const repository = deps.repository
    ? base
    : new CachingUrlRepository(base, readCacheConfigFromEnv());
  const generator = new ShortCodeGenerator(repository);
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
