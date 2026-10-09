import { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const base = process.env.LOADBOND_API_URL || "http://127.0.0.1:8000";
  const headers = new Headers();
  for (const key of ["authorization", "content-type"]) {
    const value = req.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(
      base + "/" + path.map(encodeURIComponent).join("/") + req.nextUrl.search,
      {
        method: req.method,
        headers,
        body: req.method === "GET" ? undefined : await req.arrayBuffer(),
        cache: "no-store",
      },
    );
    const resultHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const key of ["content-type", "content-disposition"]) {
      const value = response.headers.get(key);
      if (value) resultHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: resultHeaders,
    });
  } catch {
    return Response.json(
      { detail: "Backend unavailable. Start FastAPI on port 8000." },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH };
