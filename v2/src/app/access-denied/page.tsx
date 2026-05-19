/**
 * Page /access-denied — Affichée quand un user non autorisé
 * tente de se connecter (pas membre du serveur Discord + pas whitelisté).
 *
 * ⚠️ Version Phase B = minimaliste. La version stylisée
 * façon Sunagakure viendra en Phase C.
 */

"use client";

export default function AccessDeniedPage() {
  const DISCORD_INVITE = "https://discord.gg/9Cz55PvW5X";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e0a06",
        color: "#e9d8a6",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          textAlign: "center",
          border: "1px solid rgba(212, 172, 13, 0.3)",
          padding: "3rem 2rem",
          background: "rgba(20, 15, 10, 0.6)",
        }}
      >
        <h1
          style={{
            fontSize: "2rem",
            letterSpacing: "0.1em",
            marginBottom: "1.5rem",
            color: "#d4ac0d",
          }}
        >
          ACCÈS REFUSÉ
        </h1>

        <p style={{ lineHeight: 1.6, marginBottom: "1rem" }}>
          Cet intranet est réservé aux membres du village de Sunagakure.
        </p>
        <p style={{ lineHeight: 1.6, marginBottom: "2rem", opacity: 0.8 }}>
          Si tu pense devoir avoir accès, rejoins le serveur Discord
          officiel ou demande au Kazekage de t'ajouter à la whitelist.
        </p>

        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "0.75rem 2rem",
            background: "#d4ac0d",
            color: "#0e0a06",
            textDecoration: "none",
            fontWeight: 600,
            letterSpacing: "0.1em",
          }}
        >
          REJOINDRE LE SERVEUR
        </a>

        <div style={{ marginTop: "2rem", fontSize: "0.85rem", opacity: 0.5 }}>
          <a href="/" style={{ color: "#e9d8a6" }}>
            ← Retour à l'accueil
          </a>
        </div>
      </div>
    </main>
  );
}
