'use client';

/**
 * ═══════════════════════════════════════════════════════════════════
 *  SidebarContext — état partagé pour le menu burger mobile
 * ═══════════════════════════════════════════════════════════════════
 *
 * Permet au burger button (Topbar) d'ouvrir la sidebar (cachée par défaut
 * en mobile). La sidebar peut elle-même se refermer après un clic sur un
 * lien, sur l'overlay, ou avec Echap.
 *
 * Usage :
 *   const { isOpen, open, close, toggle } = useSidebar();
 *
 * Sur desktop (>= 768px), ce state est simplement ignoré — la sidebar
 * reste toujours visible via CSS.
 * ═══════════════════════════════════════════════════════════════════
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type SidebarContextType = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Fermer avec la touche Echap
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Empêcher le scroll du body quand le menu est ouvert
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Fermer automatiquement si on passe en desktop
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handleResize() {
      if (window.innerWidth >= 768 && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  return (
    <SidebarContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  // Fallback safe : si jamais on appelle useSidebar hors du provider,
  // on retourne des no-ops pour éviter les crashs.
  if (!ctx) {
    return {
      isOpen: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
