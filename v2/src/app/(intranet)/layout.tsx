import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import styles from './layout.module.css';

/**
 * Layout partagé par toutes les pages de l'intranet.
 * Grâce au "(intranet)" entre parenthèses, ce dossier ne crée pas de segment
 * d'URL — les pages restent à /dashboard, /annonces, etc., MAIS partagent
 * ce layout (sidebar + topbar).
 *
 * Si tu veux une page sans ce layout (ex: /login, /404), tu la mets
 * hors de ce dossier.
 */
export default function IntranetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <Topbar />
        <div className={styles.page}>{children}</div>
      </main>
      <ToastContainer />
      <ConfirmDialog />
    </div>
  );
}
