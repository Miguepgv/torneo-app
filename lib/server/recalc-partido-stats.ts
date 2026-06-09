import type { SupabaseClient } from "@supabase/supabase-js";

type GoalAward = "local" | "visitante" | null;

function goalAwardedSide(
  localId: string | null,
  visitId: string | null,
  equipoId: string | null,
  propiaMeta: boolean,
): GoalAward {
  if (!localId || !visitId || !equipoId) return null;
  if (equipoId !== localId && equipoId !== visitId) return null;
  const scoredForSameTeam = equipoId === localId;
  if (propiaMeta) {
    return scoredForSameTeam ? "visitante" : "local";
  }
  return scoredForSameTeam ? "local" : "visitante";
}

/** Recalcula goles y tarjetas del partido desde las tablas goles/tarjetas_partido. */
export async function recalcPartidoStats(admin: SupabaseClient, partidoId: string) {
  const { data: p, error: pErr } = await admin
    .from("partidos")
    .select("id,equipo_local_id,equipo_visitante_id")
    .eq("id", partidoId)
    .single();
  if (pErr || !p) return { error: pErr?.message ?? "Partido no encontrado." };

  const localId = p.equipo_local_id as string | null;
  const visitId = p.equipo_visitante_id as string | null;

  let golesLocal = 0;
  let golesVisit = 0;
  if (localId && visitId) {
    let goals: { equipo_id: string | null; propia_meta?: boolean | null }[] | null = null;
    const gq = await admin.from("goles").select("equipo_id,propia_meta").eq("partido_id", partidoId);
    if (gq.error) {
      const em = gq.error.message.toLowerCase();
      if (em.includes("propia_meta") || em.includes("column") || em.includes("schema cache")) {
        const fb = await admin.from("goles").select("equipo_id").eq("partido_id", partidoId);
        if (fb.error) return { error: fb.error.message };
        goals = (fb.data ?? []).map((r) => ({ ...(r as object), propia_meta: false }));
      } else return { error: gq.error.message };
    } else {
      goals = gq.data as typeof goals;
    }
    for (const g of goals ?? []) {
      const row = g as { equipo_id: string | null; propia_meta: boolean | null };
      const side = goalAwardedSide(localId, visitId, row.equipo_id, Boolean(row.propia_meta));
      if (side === "local") golesLocal += 1;
      else if (side === "visitante") golesVisit += 1;
    }
  }

  let al = 0;
  let av = 0;
  let rl = 0;
  let rv = 0;
  let ral = 0;
  let rav = 0;

  if (localId && visitId) {
    const { data: cards, error: cErr } = await admin
      .from("tarjetas_partido")
      .select("equipo_id,tipo")
      .eq("partido_id", partidoId);
    if (cErr) {
      const em = cErr.message.toLowerCase();
      if (!em.includes("relation") && !em.includes("does not exist") && !em.includes("schema cache")) {
        return { error: cErr.message };
      }
    }

    const bump = (isLocal: boolean, kind: "a" | "r" | "ra") => {
      if (isLocal) {
        if (kind === "a") al += 1;
        else if (kind === "r") rl += 1;
        else ral += 1;
      } else {
        if (kind === "a") av += 1;
        else if (kind === "r") rv += 1;
        else rav += 1;
      }
    };

    for (const c of cards ?? []) {
      const row = c as { equipo_id: string | null; tipo: string };
      const jid = row.equipo_id;
      const isLoc = jid === localId;
      const isVis = jid === visitId;
      if (!isLoc && !isVis) continue;

      switch (row.tipo) {
        case "amarilla":
          bump(isLoc, "a");
          break;
        case "doble_amarilla":
          bump(isLoc, "a");
          bump(isLoc, "a");
          bump(isLoc, "r");
          break;
        case "roja":
          bump(isLoc, "r");
          break;
        case "roja_agresion":
          bump(isLoc, "ra");
          break;
        default:
          break;
      }
    }
  }

  const { error: uErr } = await admin
    .from("partidos")
    .update({
      goles_local: golesLocal,
      goles_visitante: golesVisit,
      amarillas_local: al,
      amarillas_visitante: av,
      rojas_local: rl,
      rojas_visitante: rv,
      rojas_agresion_local: ral,
      rojas_agresion_visitante: rav,
    })
    .eq("id", partidoId);
  if (uErr) return { error: uErr.message };
  return {};
}
