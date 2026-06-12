import type { ReactNode } from 'react';

import styles from './styles.module.css';

interface Props {
  readonly children: ReactNode;
}

function NrwPage(props: Props) {
  const { children } = props;

  return (
    <div>
      <header className={styles.header}>
        <h1 className={styles.title}>National Risk Watch</h1>
        <button
          type="button"
          className={styles.userButton}
          aria-label="User menu"
        >
          <span className={styles.avatar}>WW</span>
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default NrwPage;
