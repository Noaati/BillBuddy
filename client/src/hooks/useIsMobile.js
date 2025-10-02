import { useEffect, useState } from 'react';

export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);

    mq.addEventListener?.('change', handler);

    return () => {
      mq.removeEventListener?.('change', handler);
    };
  }, [breakpoint]);

  return isMobile;
}
