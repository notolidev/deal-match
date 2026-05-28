import type {
  AnalysisResult,
  PriceObservation,
  ProductSignals,
} from "@deal-match/shared";
import { sql } from "./db.js";
import { identityHash } from "./identity.js";

const FRESH_MS = 24 * 60 * 60 * 1000;

export interface CachedAnalysis {
  productId: string;
  result: AnalysisResult;
  fresh: boolean;
}

export async function upsertProduct(signals: ProductSignals): Promise<string> {
  const hash = identityHash(signals);
  const db = sql();
  const rows = await db<{ id: string }[]>`
    insert into products (identity_hash, canonical_title, brand, upc)
    values (${hash}, ${signals.title ?? null}, ${signals.brand ?? null}, ${signals.upc ?? signals.gtin ?? null})
    on conflict (identity_hash) do update set
      canonical_title = coalesce(products.canonical_title, excluded.canonical_title),
      brand = coalesce(products.brand, excluded.brand),
      upc = coalesce(products.upc, excluded.upc)
    returning id
  `;
  return rows[0].id;
}

export async function getCached(
  signals: ProductSignals,
): Promise<CachedAnalysis | null> {
  const hash = identityHash(signals);
  const db = sql();
  const rows = await db<
    { id: string; verdict_json: AnalysisResult; generated_at: Date }[]
  >`
    select p.id, a.verdict_json, a.generated_at
    from products p
    join analyses a on a.product_id = p.id
    where p.identity_hash = ${hash}
    order by a.generated_at desc
    limit 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    productId: r.id,
    result: r.verdict_json,
    fresh: Date.now() - new Date(r.generated_at).getTime() < FRESH_MS,
  };
}

export async function writeObservations(
  productId: string,
  observations: PriceObservation[],
): Promise<void> {
  if (observations.length === 0) return;
  const db = sql();
  await db`
    insert into price_observations ${db(
      observations.map((o) => ({
        product_id: productId,
        retailer: o.retailer,
        url: o.url,
        price: o.price,
        currency: o.currency,
        in_stock: o.inStock ?? null,
        observed_at: o.observedAt,
      })),
    )}
  `;
}

export async function writeAnalysis(
  productId: string,
  result: AnalysisResult,
): Promise<void> {
  const db = sql();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = db.json(result as any);
  await db`
    insert into analyses (product_id, verdict_json, generated_at)
    values (${productId}, ${payload}, ${result.generatedAt})
  `;
}
