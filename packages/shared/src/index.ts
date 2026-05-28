export type Verdict = "buy" | "wait" | "neutral";

export interface ProductSignals {
  url: string;
  title?: string;
  brand?: string;
  upc?: string;
  gtin?: string;
  sku?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  jsonLd?: unknown;
  pageTextSnippet?: string;
}

export interface AnalyzeRequest {
  signals: ProductSignals;
  /** Skip the cache and force a fresh analysis (used by "Re-analyse"). */
  refresh?: boolean;
}

export interface PriceObservation {
  retailer: string;
  url: string;
  price: number;
  currency: string;
  observedAt: string;
  inStock?: boolean;
}

export interface BetterDeal {
  retailer: string;
  url: string;
  price: number;
  currency: string;
  savings: number;
}

export interface AnalysisResult {
  verdict: Verdict;
  confidence: number;
  oneLineReason: string;
  waitForEvent?: string;
  currentPrice?: number;
  currency?: string;
  ninetyDayLow?: number;
  observations: PriceObservation[];
  betterDeal?: BetterDeal;
  generatedAt: string;
}

export type AnalyzeStatus = "pending" | "ready" | "error";

export interface AnalyzeResponse {
  jobId: string;
  status: AnalyzeStatus;
  result?: AnalysisResult;
  error?: string;
}
