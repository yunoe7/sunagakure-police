import type { IntranetUser } from "@/lib/roles";
import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session extends DefaultSession {
    intranet?: IntranetUser;
    lastRefresh?: number;
    user?: {
      discordId?: string;
      discordUsername?: string;
      discordGlobalName?: string;
      discordAvatar?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    discordId?: string;
    discordUsername?: string;
    discordGlobalName?: string;
    discordAvatar?: string | null;
    intranet?: IntranetUser;
    // Refresh automatique
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    lastRefresh?: number;
  }
}
