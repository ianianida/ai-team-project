const headers = { "Cache-Control": "no-store" };

/** Check the Supabase database without exposing credentials or application data. */
export async function GET(): Promise<Response> {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return Response.json(
      { status: "error", message: "Supabase is not configured" },
      { status: 503, headers },
    );
  }

  try {
    const response = await fetch(
      `${url.replace(/\/+$/, "")}/rest/v1/rpc/team_project_health_check`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok || (await response.json()) !== true) {
      return Response.json(
        { status: "error", message: "Supabase database is unavailable" },
        { status: 503, headers },
      );
    }

    return Response.json({ status: "ok", database: "connected" }, { headers });
  } catch {
    return Response.json(
      { status: "error", message: "Supabase database is unavailable" },
      { status: 503, headers },
    );
  }
}
