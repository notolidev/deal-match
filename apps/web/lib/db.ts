import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — provision a Postgres integration in the Vercel Marketplace (Neon recommended) and re-run `vercel env pull`.",
    );
  }
  _sql = postgres(url, { prepare: false, max: 5 });
  return _sql;
}
