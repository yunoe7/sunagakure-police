'use client';

import { useToastStore } from '@/lib/toast';
import styles from './ToastContainer.module.css';
import clsx from 'clsx';

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className={styles.container} aria-live="polite" role="status">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(styles.toast, styles[t.type])}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
