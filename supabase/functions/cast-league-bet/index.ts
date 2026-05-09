import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VoteBody = {
  matchSlug?: string;
  bettorKey?: string;
  team?: "a" | "b";
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const body = (await request.json().catch(() => ({}))) as VoteBody;
  const team = body.team;

  if (team !== "a" && team !== "b") {
    return json({ error: "invalid_team" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const salt = Deno.env.get("IP_HASH_SALT");

  if (!supabaseUrl || !serviceRoleKey || !salt) {
    return json({ error: "missing_server_config" }, 500);
  }

  const ip = getRequestIp(request);
  if (!ip) {
    return json({ error: "ip_not_found" }, 400);
  }

  const ipHash = await sha256(`${salt}:${ip}`);
  const bettorKey = normalizeBettorKey(body.bettorKey);
  const matchSlug = body.matchSlug || "space-star-league-main";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("cast_league_bet", {
    p_match_slug: matchSlug,
    p_bettor_key: bettorKey,
    p_team: team,
    p_ip_hash: ipHash,
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  const result = Array.isArray(data) ? data[0] : data;
  const status = result?.already_voted ? 409 : 200;
  return json({ vote: result }, status);
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

function normalizeBettorKey(value?: string) {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length >= 8 && trimmed.length <= 120) return trimmed;
  return crypto.randomUUID();
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
