import { useEffect, useRef } from 'react';
import styles from './Modal.module.css';

export default function Modal({ open, onClose, title = '', content }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => dialogRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
    >
      <div
        className={styles.dialog}
        tabIndex={-1}
        ref={dialogRef}>
            <div className={styles.header}>
                {title && <h3 id="modal-title" className={styles.title}>{title}</h3>}
                <button className={styles.closeBtn} onClick={onClose}>✕</button>
            </div>
            <div className={styles.content}>
                {content}
            </div>
      </div>
    </div>
  );
}
