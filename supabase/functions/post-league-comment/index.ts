const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CommentBody = {
  matchSlug?: string;
  commenterKey?: string;
  body?: string;
};

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const salt = Deno.env.get("IP_HASH_SALT");

    if (!supabaseUrl || !serviceRoleKey || !salt) {
      return json(
        {
          error: "missing_server_config",
          missing: {
            SUPABASE_URL: !supabaseUrl,
            SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
            IP_HASH_SALT: !salt,
          },
        },
        500,
      );
    }

    const ip = getRequestIp(request);
    if (!ip) {
      return json({ error: "ip_not_found" }, 400);
    }

    const body = (await request.json().catch(() => ({}))) as CommentBody;
    const comment = body.body?.trim() || "";

    if (!comment || comment.length > 120) {
      return json({ error: "invalid_comment" }, 400);
    }

    const ipHash = await sha256(`${salt}:${ip}`);
    const rpc = await callRpc(supabaseUrl, serviceRoleKey, "post_league_comment", {
      p_match_slug: body.matchSlug || "space-star-league-main",
      p_commenter_key: normalizeCommenterKey(body.commenterKey),
      p_body: comment,
      p_ip_hash: ipHash,
    });

    if (!rpc.ok) {
      return json({ error: "rpc_failed", status: rpc.status, details: rpc.payload }, 500);
    }

    const result = Array.isArray(rpc.payload) ? rpc.payload[0] : rpc.payload;
    if (!result) {
      return json({ error: "comment_failed" }, 500);
    }

    if (result.error_code === "insufficient_diamonds") {
      return json({ error: "insufficient_diamonds", comment: result }, 402);
    }

    return json({ comment: result });
  } catch (error) {
    return json(
      {
        error: "worker_exception",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-client-ip")
  );
}

function normalizeCommenterKey(value?: string) {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length >= 8 && trimmed.length <= 120) return trimmed;
  return crypto.randomUUID();
}

async function callRpc(supabaseUrl: string, serviceRoleKey: string, name: string, payload: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return {
    ok: response.ok,
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
