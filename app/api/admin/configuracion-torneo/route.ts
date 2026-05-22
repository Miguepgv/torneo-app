import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  total_equipos?: number;
  total_grupos?: number;
  clasifica_champions?: number;
  clasifica_europa?: number;
  clasifica_conference?: number;
  desempate_1?: string;
  desempate_2?: string;
  desempate_3?: string;
  excluir_ultimo_grupo_mayor?: boolean;
  limite_cambios_hasta?: string | null;
  criterios_desempate?: string[];
  fairplay_falta_pts?: number;
  fairplay_amarilla_pts?: number;
  fairplay_roja_pts?: number;
  fairplay_roja_agresion_pts?: number;
  champions_direct_positions?: string;
  champions_best_seconds?: number;
  champions_best_thirds?: number;
  europa_direct_positions?: string;
  europa_best_seconds?: number;
  europa_best_thirds?: number;
  conference_direct_positions?: string;
  conference_best_seconds?: number;
  conference_best_thirds?: number;
  conference_best_fourths?: number;
  conference_best_fifths?: number;
  qualification_mode?: "simple" | "advanced";
};

async function ensureAdmin(request: NextRequest) {
  const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !token) return { ok: false as const, error: "No autenticado." };

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesion invalida." };
  const { data: me } = await userClient.from("usuarios").select("rol").eq("id", user.id).single();
  if (me?.rol !== "admin") return { ok: false as const, error: "Solo admin." };
  return { ok: true as const, url };
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "Falta service role key." }, { status: 500 });
  const admin = createClient(auth.url, serviceRoleKey);
  const { data, error } = await admin.from("configuracion_torneo").select("*").limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, config: data ?? null });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: "Falta service role key." }, { status: 500 });
  const admin = createClient(auth.url, serviceRoleKey);
  const body = (await request.json()) as Body;

  const payload = {
    total_equipos: Number(body.total_equipos ?? 16),
    total_grupos: Number(body.total_grupos ?? 1),
    clasifica_champions: Number(body.clasifica_champions ?? 0),
    clasifica_europa: Number(body.clasifica_europa ?? 0),
    clasifica_conference: Number(body.clasifica_conference ?? 0),
    desempate_1: (body.desempate_1 ?? "goal_difference").trim(),
    desempate_2: (body.desempate_2 ?? "goals_for").trim(),
    desempate_3: (body.desempate_3 ?? "head_to_head_points").trim(),
    excluir_ultimo_grupo_mayor: Boolean(body.excluir_ultimo_grupo_mayor ?? true),
    limite_cambios_hasta: body.limite_cambios_hasta || null,
    criterios_desempate:
      Array.isArray(body.criterios_desempate) && body.criterios_desempate.length
        ? body.criterios_desempate
        : ["goal_difference", "goals_for", "head_to_head_points"],
    fairplay_falta_pts: Number(body.fairplay_falta_pts ?? 1),
    fairplay_amarilla_pts: Number(body.fairplay_amarilla_pts ?? 3),
    fairplay_roja_pts: Number(body.fairplay_roja_pts ?? 5),
    fairplay_roja_agresion_pts: Number(body.fairplay_roja_agresion_pts ?? 10),
    champions_direct_positions: (body.champions_direct_positions ?? "1").trim(),
    champions_best_seconds: Number(body.champions_best_seconds ?? 0),
    champions_best_thirds: Number(body.champions_best_thirds ?? 0),
    europa_direct_positions: (body.europa_direct_positions ?? "").trim(),
    europa_best_seconds: Number(body.europa_best_seconds ?? 0),
    europa_best_thirds: Number(body.europa_best_thirds ?? 0),
    conference_direct_positions: (body.conference_direct_positions ?? "").trim(),
    conference_best_seconds: Number(body.conference_best_seconds ?? 0),
    conference_best_thirds: Number(body.conference_best_thirds ?? 0),
    conference_best_fourths: Number(body.conference_best_fourths ?? 0),
    conference_best_fifths: Number(body.conference_best_fifths ?? 0),
    qualification_mode: body.qualification_mode === "simple" ? "simple" : "advanced",
  };

  async function upsertConfig(unsafePayload: Record<string, unknown>) {
    const { data: existing } = await admin.from("configuracion_torneo").select("id").limit(1).maybeSingle();
    if (existing?.id) {
      return admin.from("configuracion_torneo").update(unsafePayload).eq("id", existing.id);
    }
    return admin.from("configuracion_torneo").insert(unsafePayload);
  }

  const try1 = await upsertConfig(payload as unknown as Record<string, unknown>);
  if (!try1.error) return NextResponse.json({ ok: true });

  const m = try1.error.message.toLowerCase();
  const mentionsSchemaCache = m.includes("schema cache") || m.includes("could not find");
  const legacyCols = [
    "qualification_mode",
    "total_equipos",
    "conference_best_fourths",
    "conference_best_fifths",
  ] as const;
  const shouldRetryLegacy = mentionsSchemaCache && legacyCols.some((c) => m.includes(c));

  if (shouldRetryLegacy) {
    const fallback = { ...(payload as Record<string, unknown>) };
    for (const c of legacyCols) delete fallback[c];
    const try2 = await upsertConfig(fallback);
    if (!try2.error) {
      return NextResponse.json({
        ok: true,
        warning: "Se guardo en modo compatibilidad (faltan columnas nuevas en DB).",
      });
    }
    return NextResponse.json({ error: try2.error.message }, { status: 400 });
  }

  return NextResponse.json({ error: try1.error.message }, { status: 400 });
}
