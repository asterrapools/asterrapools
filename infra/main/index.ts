// Edge-runtime main service: routes /<name>/... (or /functions/v1/<name>/...) to the function in /home/deno/functions/<name>.
// Only `api` and `indexer` exist; anything else is a 404 so arbitrary paths never spawn workers.
const FUNCTIONS = new Set(["api", "indexer"]);
const LIMITS: Record<string, { memoryLimitMb: number; workerTimeoutMs: number }> = {
  api: { memoryLimitMb: 256, workerTimeoutMs: 30_000 },
  indexer: { memoryLimitMb: 512, workerTimeoutMs: 150_000 },
};

Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname.replace(/^\/functions\/v1/, "");
  const name = path.split("/")[1] ?? "";
  if (!FUNCTIONS.has(name)) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
  try {
    // @ts-ignore EdgeRuntime is a global of the Supabase edge-runtime
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      ...LIMITS[name],
      noModuleCache: false,
      envVars: Object.entries(Deno.env.toObject()),
      forceCreate: false,
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(`worker ${name}:`, e);
    return new Response(JSON.stringify({ error: "function unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
  }
});
