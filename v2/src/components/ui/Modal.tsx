'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Modale générique avec fermeture par overlay/Escape/bouton X.
 * Utilisée pour les formulaires d'édition, confirmations, détails, etc.
 *
 * @example
 * <Modal open={editing} onClose={() => setEditing(false)} title="Nouveau patient" footer={...}>
 *   <input ... />
 * </Modal>
 */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  // Fermeture par touche Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Bloque le scroll du body pendant que la modale est ouverte
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${styles[size]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className={styles.header}>
          <h3 id="modal-title">{title}</h3>
          <button onClick={onClose} aria-label="Fermer" className={styles.closeBtn}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
