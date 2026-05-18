import { type HTMLAttributes, type ReactNode } from 'react';
import styles from './Card.module.css';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Carte standard utilisée partout dans l'intranet.
 * Remplace les nombreuses `<div class="card">` de l'ancien HTML.
 */
export function Card({ title, subtitle, actions, children, className, ...rest }: CardProps) {
  return (
    <div className={clsx(styles.card, className)} {...rest}>
      {(title || actions) && (
        <div className={styles.header}>
          <div>
            {title && <h2 className={styles.title}>{title}</h2>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
