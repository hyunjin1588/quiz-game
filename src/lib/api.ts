import { NextResponse } from "next/server";
import { getDb, type DB } from "./db";
import { GameError } from "./game";

/** Runs a route action and maps GameError to its HTTP status. Responses are never cached. */
export function respond<T>(action: (db: DB) => T) {
  const headers = { "Cache-Control": "no-store" };
  try {
    return NextResponse.json(action(getDb()), { headers });
  } catch (e) {
    if (e instanceof GameError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.status, headers });
    }
    console.error(e);
    return NextResponse.json({ error: "internal", message: "서버 오류가 발생했습니다." }, { status: 500, headers });
  }
}

/** For POST routes: parses the JSON body, then runs the action through `respond`. */
export async function handleJson<T>(request: Request, action: (db: DB, body: Record<string, unknown>) => T) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_body", message: "요청 본문은 객체여야 합니다." }, { status: 400 });
  }
  return respond((db) => action(db, body as Record<string, unknown>));
}
