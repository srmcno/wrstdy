import { useEffect, useState } from 'react';

// Breakpoints are measured against the APP's own box, not the viewport.
//
// The standalone build fills the window, so viewport media queries would be
// equivalent there. The Power Apps code component does not: it can be 380px
// wide inside a 1920px browser window, where every `@media (max-width: 720px)`
// rule stays dormant and the sidebar, the 4-column grids, and the wide tables
// all overflow. A ResizeObserver on the root element gives both hosts the same
// responsive behavior.
export const NARROW_PX = 820;
export const XNARROW_PX = 520;

/**
 * @param {import('react').RefObject<HTMLElement>} ref app root element
 * @returns {{width: number, narrow: boolean, xnarrow: boolean}}
 */
export function useContainerSize(ref) {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver is available in every browser Power Apps supports, but
    // guard anyway so an older standalone browser degrades to viewport width
    // rather than throwing during mount.
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => setWidth(window.innerWidth);
      onResize();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (typeof w === 'number' && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || window.innerWidth);
    return () => ro.disconnect();
  }, [ref]);

  return { width, narrow: width < NARROW_PX, xnarrow: width < XNARROW_PX };
}
