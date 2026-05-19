'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  Composant OpsMap — Carte tactique interactive
 * ════════════════════════════════════════════════════════════════
 *
 * Affiche la carte de Sunagakure (SVG hébergée sur GitHub) avec :
 *   - Zoom in/out vectoriel
 *   - Pan en draggant la carte
 *   - Pins cliquables pour chaque opération
 *   - Mode "placer" pour positionner un pin sur la carte
 *   - Filtres par statut (Active / Préparation / Terminée)
 *   - Recherche
 *
 * Le SVG est chargé depuis :
 *   https://raw.githubusercontent.com/yunoe7/sunagakure-police/main/cartographie-nrp.svg
 *
 * Les coordonnées des pins sont stockées en % du viewBox du SVG.
 * ════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPin, X, Maximize2, Plus, Minus, RotateCcw } from 'lucide-react';
import type { Operation, OperationStatut } from '@/types/police-rh';
import { OPERATION_STATUT_LABEL, OPERATION_TYPE_LABEL } from '@/types/police-rh';
import styles from './OpsMap.module.css';

const SVG_URL = 'https://raw.githubusercontent.com/yunoe7/sunagakure-police/main/cartographie-nrp.svg';

interface Props {
  operations: Operation[];
  /** Appelée quand on change la position d'un pin (drag&drop ou placement) */
  onUpdatePosition: (op: Operation, mapX: number, mapY: number) => void;
}

type FilterKey = 'Active' | 'Préparation' | 'Terminée';

/**
 * Génère une position pseudo-aléatoire mais stable à partir d'un id.
 * Utilisé pour les pins qui n'ont pas encore de coordonnées.
 */
function pinHash(id: number, salt: number, min: number, max: number): number {
  const h = (((id * 2654435761 + salt * 1234567) >>> 0) % 1000) / 1000;
  return min + h * (max - min);
}

export default function OpsMap({ operations, onUpdatePosition }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // SVG et viewBox
  const [svgLoaded, setSvgLoaded] = useState(false);
  const [svgError, setSvgError] = useState(false);

  // Zoom & pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Drag state (en refs pour ne pas re-render)
  const dragState = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false, startX: 0, startY: 0, originX: 0, originY: 0,
  });

  // Filtres
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    Active: true, Préparation: true, Terminée: false,  // Terminée masquée par défaut
  });

  // Recherche
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Mode placement
  const [placingFor, setPlacingFor] = useState<Operation | null>(null);
  const [showOpPicker, setShowOpPicker] = useState(false);

  // Tooltip sur un pin
  const [tooltipOpId, setTooltipOpId] = useState<number | null>(null);

  // ─── Charger le SVG ───
  useEffect(() => {
    let cancelled = false;
    const container = svgContainerRef.current;
    if (!container) return;

    container.innerHTML = `<div class="${styles.loading}">Chargement de la carte…</div>`;

    fetch(SVG_URL)
      .then((r) => r.text())
      .then((svgText) => {
        if (cancelled) return;
        // Nettoyer header XML et DOCTYPE
        const cleaned = svgText
          .replace(/<\?xml[^?]*\?>/gi, '')
          .replace(/<!DOCTYPE[^>]*>/gi, '')
          .trim();
        container.innerHTML = cleaned;
        const svg = container.querySelector('svg');
        if (svg) {
          // S'assurer d'avoir un viewBox
          let vb = svg.getAttribute('viewBox');
          if (!vb) {
            const w = svg.getAttribute('width') || '1000';
            const h = svg.getAttribute('height') || '1000';
            svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
            vb = svg.getAttribute('viewBox')!;
          }
          // Supprimer width/height fixes
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
        }
        setSvgLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback : afficher comme image normale
        container.innerHTML = `<img src="${SVG_URL}" alt="Carte de Sunagakure" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain" />`;
        setSvgError(true);
        setSvgLoaded(true);
      });

    return () => { cancelled = true; };
  }, []);

  // ─── Opérations visibles (avec filtres + recherche) ───
  const visibleOps = useMemo(() => {
    return operations.filter((op) => {
      // Filtre statut (3 boutons : Active, Préparation, Terminée)
      const key: FilterKey | null =
        op.statut === 'Active' ? 'Active' :
        op.statut === 'Préparation' ? 'Préparation' :
        op.statut === 'Terminée' ? 'Terminée' : null;
      if (!key || !filters[key]) return false;

      // Recherche
      const q = search.trim().toLowerCase();
      if (q && !((op.nom || '') + ' ' + (op.resp || '')).toLowerCase().includes(q)) return false;

      return true;
    });
  }, [operations, filters, search]);

  // Liste opérations à proposer en mode placement (toutes, pas filtrées)
  const placementCandidates = useMemo(
    () => operations.filter((op) => op.statut !== 'Terminée' && op.statut !== 'Annulée'),
    [operations]
  );

  // ─── Zoom ───
  function doZoom(factor: number, originScreen?: { x: number; y: number }) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    // Centre du zoom (par défaut : centre du conteneur)
    const cx = originScreen ? originScreen.x - rect.left : rect.width / 2;
    const cy = originScreen ? originScreen.y - rect.top : rect.height / 2;

    const newZoom = Math.max(1, Math.min(8, zoom * factor));
    if (Math.abs(newZoom - zoom) < 0.001) return;

    // Ajuster le pan pour que le point sous la souris reste au même endroit
    const ratio = newZoom / zoom;
    const newPanX = cx - (cx - panX) * ratio;
    const newPanY = cy - (cy - panY) * ratio;

    setZoom(newZoom);
    setPanX(constrainPan(newPanX, newZoom, rect.width, 'x'));
    setPanY(constrainPan(newPanY, newZoom, rect.height, 'y'));
  }

  function constrainPan(p: number, z: number, dim: number, _axis: 'x' | 'y'): number {
    if (z <= 1) return 0;
    const max = 0;
    const min = dim - dim * z;
    return Math.max(min, Math.min(max, p));
  }

  function resetView() {
    setZoom(1); setPanX(0); setPanY(0);
  }

  // ─── Pan (drag) ───
  function handleMouseDown(e: React.MouseEvent) {
    // Si on est en mode placement, ne pas démarrer un drag
    if (placingFor) return;
    // Ignorer si on a cliqué sur un pin
    if ((e.target as HTMLElement).closest(`.${styles.pin}`)) return;
    if (zoom <= 1) return;

    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: panX,
      originY: panY,
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setPanX(constrainPan(dragState.current.originX + dx, zoom, rect.width, 'x'));
    setPanY(constrainPan(dragState.current.originY + dy, zoom, rect.height, 'y'));
  }

  function handleMouseUp() {
    dragState.current.active = false;
  }

  // ─── Wheel zoom ───
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    doZoom(factor, { x: e.clientX, y: e.clientY });
  }

  // ─── Click sur la carte (mode placement) ───
  function handleMapClick(e: React.MouseEvent) {
    if (!placingFor) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    // Coordonnées en pixels du clic relatives au wrap
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Convertir en coordonnées du contenu transformé (annuler pan + zoom)
    const contentX = (cx - panX) / zoom;
    const contentY = (cy - panY) / zoom;
    // Convertir en %
    const mapX = (contentX / rect.width) * 100;
    const mapY = (contentY / rect.height) * 100;
    // Clamp 0-100
    const x = Math.max(2, Math.min(98, mapX));
    const y = Math.max(2, Math.min(98, mapY));

    onUpdatePosition(placingFor, x, y);
    setPlacingFor(null);
  }

  // ─── Démarrer un placement ───
  function startPlacement() {
    if (placingFor) { setPlacingFor(null); return; }
    if (placementCandidates.length === 0) return;
    if (placementCandidates.length === 1) {
      setPlacingFor(placementCandidates[0]);
    } else {
      setShowOpPicker(true);
    }
  }

  // ─── Cycle de statut ───
  // (pas implémenté en interne, géré par la page parente via onUpdatePosition au besoin)

  // Toggle filter
  function toggleFilter(k: FilterKey) {
    setFilters({ ...filters, [k]: !filters[k] });
  }

  // Tooltip
  const tooltipOp = tooltipOpId !== null ? operations.find((o) => o.id === tooltipOpId) : null;

  // Click hors tooltip → fermer
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (tooltipOpId === null) return;
      const target = e.target as HTMLElement;
      if (target.closest(`.${styles.tooltip}`) || target.closest(`.${styles.pin}`)) return;
      setTooltipOpId(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [tooltipOpId]);

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Filtres */}
        <div className={styles.filters}>
          {(['Active', 'Préparation', 'Terminée'] as FilterKey[]).map((k) => (
            <button
              key={k}
              className={`${styles.filterBtn} ${filters[k] ? styles.filterOn : ''}`}
              onClick={() => toggleFilter(k)}
              title={`Afficher/masquer ${k}`}
            >
              <span className={`${styles.dot} ${styles[`dot-${k}`]}`} />
              {OPERATION_STATUT_LABEL[k]}
            </button>
          ))}
        </div>

        <div className={styles.sep} />

        {/* Recherche */}
        <div className={`${styles.searchWrap} ${searchOpen ? styles.searchOpen : ''}`}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Effacer">
              <X size={11} />
            </button>
          )}
        </div>

        <div className={styles.sep} />

        {/* Placer */}
        <button
          className={`${styles.placeBtn} ${placingFor ? styles.placeBtnActive : ''}`}
          onClick={startPlacement}
          disabled={placementCandidates.length === 0}
          title={placementCandidates.length === 0 ? 'Aucune opération à placer' : 'Placer un pin sur la carte'}
        >
          <MapPin size={12} /> Placer
        </button>
      </div>

      {/* Bannière mode placement */}
      {placingFor && (
        <div className={styles.placeBanner}>
          <MapPin size={14} />
          <div className={styles.placeBannerText}>
            <div className={styles.placeBannerLabel}>MODE PLACEMENT — CLIQUE SUR LA CARTE</div>
            <div className={styles.placeBannerName}>📍 {placingFor.nom}</div>
          </div>
          <button className={styles.placeBannerCancel} onClick={() => setPlacingFor(null)}>
            <X size={12} /> Annuler
          </button>
        </div>
      )}

      {/* Conteneur de la carte */}
      <div
        ref={wrapRef}
        className={`${styles.mapWrap} ${placingFor ? styles.placing : ''} ${zoom > 1 ? styles.zoomed : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleMapClick}
      >
        {/* Header */}
        <div className={styles.mapHeader}>
          <span>🗺️ Carte tactique des opérations</span>
          <span className={styles.author}>by boutchiko & Flow_Flop</span>
        </div>

        {/* Zoom controls */}
        <div className={styles.zoomControls}>
          <button onClick={(e) => { e.stopPropagation(); doZoom(1.2); }} title="Zoom +"><Plus size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); doZoom(1 / 1.2); }} title="Zoom −"><Minus size={12} /></button>
          <button onClick={(e) => { e.stopPropagation(); resetView(); }} title="Réinitialiser"><RotateCcw size={11} /></button>
        </div>

        {/* Inner transform — contient SVG + pins */}
        <div
          className={styles.mapInner}
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* SVG container */}
          <div ref={svgContainerRef} className={styles.svgContainer} />

          {/* Pins */}
          {svgLoaded && visibleOps.map((op) => {
            const px = op.mapX ?? pinHash(op.id, 1, 8, 88);
            const py = op.mapY ?? pinHash(op.id, 7, 12, 82);
            const statusClass = op.statut === 'Active' ? 'pin-Active' :
                               op.statut === 'Préparation' ? 'pin-Préparation' :
                               'pin-Terminée';
            return (
              <button
                key={op.id}
                className={`${styles.pin} ${styles[statusClass]}`}
                style={{ left: `${px}%`, top: `${py}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setTooltipOpId(tooltipOpId === op.id ? null : op.id);
                }}
                aria-label={op.nom}
              >
                <span className={styles.pinDot} />
                <span className={styles.pinLine} />
              </button>
            );
          })}
        </div>

        {/* Tooltip */}
        {tooltipOp && (() => {
          const wrap = wrapRef.current;
          if (!wrap) return null;
          const rect = wrap.getBoundingClientRect();
          const px = tooltipOp.mapX ?? pinHash(tooltipOp.id, 1, 8, 88);
          const py = tooltipOp.mapY ?? pinHash(tooltipOp.id, 7, 12, 82);
          // Position du pin en pixels écran : (px% du contenu) × zoom + pan
          const pinPx = (px / 100) * rect.width * zoom + panX;
          const pinPy = (py / 100) * rect.height * zoom + panY;

          const TT_W = 250;
          let left = pinPx + 18;
          if (left + TT_W > rect.width - 10) left = pinPx - TT_W - 18;
          let top = pinPy - 80;
          if (top < 8) top = 8;
          if (top + 180 > rect.height) top = rect.height - 188;

          return (
            <div className={styles.tooltip} style={{ left, top }}>
              <button className={styles.tooltipClose} onClick={() => setTooltipOpId(null)} aria-label="Fermer">
                <X size={11} />
              </button>
              <div className={styles.tooltipNom}>{tooltipOp.nom}</div>
              <div className={styles.tooltipBadges}>
                <span className={`${styles.tooltipBadge} ${styles[`badge-${tooltipOp.statut}`]}`}>
                  {OPERATION_STATUT_LABEL[tooltipOp.statut]}
                </span>
                <span className={styles.tooltipType}>
                  {OPERATION_TYPE_LABEL[tooltipOp.type]}
                </span>
              </div>
              {tooltipOp.resp && (
                <div className={styles.tooltipResp}>👤 {tooltipOp.resp}</div>
              )}
              {tooltipOp.desc && (
                <div className={styles.tooltipDesc}>
                  {tooltipOp.desc.length > 100 ? tooltipOp.desc.slice(0, 100) + '…' : tooltipOp.desc}
                </div>
              )}
            </div>
          );
        })()}

        {svgError && (
          <div className={styles.errorBadge}>⚠ Image affichée en mode dégradé</div>
        )}
      </div>

      {/* Picker mode placement (si plusieurs opérations à placer) */}
      {showOpPicker && (
        <div className={styles.pickerOverlay} onClick={() => setShowOpPicker(false)}>
          <div className={styles.picker} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pickerTitle}>Choisir l&apos;opération à placer</div>
            <div className={styles.pickerList}>
              {placementCandidates.map((op) => (
                <button
                  key={op.id}
                  className={styles.pickerItem}
                  onClick={() => { setPlacingFor(op); setShowOpPicker(false); }}
                >
                  <span className={`${styles.dot} ${styles[`dot-${op.statut}`]}`} />
                  <span className={styles.pickerItemName}>{op.nom}</span>
                  <span className={styles.pickerItemStatus}>{op.statut}</span>
                </button>
              ))}
            </div>
            <button className={styles.pickerCancel} onClick={() => setShowOpPicker(false)}>
              <X size={11} /> Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
