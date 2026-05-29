/**
 * ════════════════════════════════════════════════════════════════
 *  Route API DEBUG DISCORD — diagnostic temporaire
 * ════════════════════════════════════════════════════════════════
 *  URL : /api/debug-discord
 *
 *  Appelle l'API Discord avec l'access_token de la session courante
 *  et renvoie la réponse BRUTE (statut + liste des rôles) pour voir
 *  exactement ce que Discord répond.
 *
 *  ⚠️ ROUTE TEMPORAIRE — à supprimer après diagnostic.
 *  Ne renvoie PAS l'access_token lui-même (sécurité).
 * ════════════════════════════════════════════════════════════════
 */

import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { GUILD_ID } from "@/lib/roles";

const DISCORD_API = "https://discord.com/api/v10";

export async function GET(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    return NextResponse.json(
      { error: "Pas de session / token introuvable. Es-tu connecté ?" },
      { status: 401 }
    );
  }

  const accessToken = token.accessToken as string | undefined;
  const discordId = token.discordId as string | undefined;

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "Pas d'access_token dans le JWT (vieux JWT ?). Déconnecte-toi et reconnecte-toi.",
        discordId: discordId ?? null,
      },
      { status: 400 }
    );
  }

  // Appel direct à l'endpoint OAuth member
  const url = `${DISCORD_API}/users/@me/guilds/${GUILD_ID}/member`;
  let status = 0;
  let statusText = "";
  let raw: unknown = null;
  let roles: string[] = [];
  let errorText: string | null = null;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    status = res.status;
    statusText = res.statusText;

    const text = await res.text();
    try {
      raw = JSON.parse(text);
      if (raw && typeof raw === "object" && Array.isArray((raw as { roles?: string[] }).roles)) {
        roles = (raw as { roles: string[] }).roles;
      }
    } catch {
      errorText = text.slice(0, 500);
    }
  } catch (err) {
    errorText = String(err);
  }

  return NextResponse.json({
    discordId: discordId ?? null,
    endpoint: url,
    httpStatus: status,
    httpStatusText: statusText,
    rolesCount: roles.length,
    roles,
    // 'raw' contient l'objet member complet renvoyé par Discord (nick, joined_at, roles, etc.)
    raw,
    parseError: errorText,
  });
}
