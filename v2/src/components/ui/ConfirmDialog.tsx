'use client';

import { create } from 'zustand';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

interface ConfirmStore {
  open: boolean;
  options: ConfirmOptions;
  resolver: ((value: boolean) => void) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  respond: (value: boolean) => void;
}

const useConfirmStore = create<ConfirmStore>((set, get) => ({
  open: false,
  options: { message: '' },
  resolver: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, options, resolver: resolve });
    }),
  respond: (value) => {
    const { resolver } = get();
    if (resolver) resolver(value);
    set({ open: false, resolver: null });
  },
}));

/**
 * Helper "one-shot" pour demander confirmation depuis n'importe où.
 *
 * @example
 * const ok = await confirmAction({
 *   message: 'Supprimer ce patient ?',
 *   confirmLabel: 'Supprimer',
 *   variant: 'danger',
 * });
 * if (ok) {
 *   await dbRemove(`medical/patients/${id}`);
 * }
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}

/**
 * À mettre une seule fois dans le layout (déjà inclus dans (intranet)/layout.tsx).
 */
export function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const respond = useConfirmStore((s) => s.respond);

  return (
    <Modal
      open={open}
      onClose={() => respond(false)}
      title={options.title ?? 'Confirmation'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => respond(false)}>
            {options.cancelLabel ?? 'Annuler'}
          </Button>
          <Button
            variant={options.variant ?? 'primary'}
            onClick={() => respond(true)}
          >
            {options.confirmLabel ?? 'Confirmer'}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--text2)', lineHeight: 1.5 }}>{options.message}</p>
    </Modal>
  );
}
