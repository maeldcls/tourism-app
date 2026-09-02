import { useState, useRef, useCallback } from 'react';

const DEFAULT_MIN_VH = 30;
const DEFAULT_MAX_VH = 85;

// ── Hauteur ajustable d'un bottom-sheet, via glisser sur sa poignée ─────────────
// Hauteur fixe (indépendante du contenu, contrairement à max-height + contenu
// naturel) exprimée en vh, modifiable en glissant sur la poignée (souris ou
// tactile via les Pointer Events, qui unifient les deux).
export function useResizableSheet(defaultVh = 50, { minVh = DEFAULT_MIN_VH, maxVh = DEFAULT_MAX_VH } = {}) {
  const [heightVh, setHeightVh] = useState(defaultVh);
  const dragRef = useRef(null); // { startY, startVh }

  const onPointerDown = useCallback((e) => {
    dragRef.current = { startY: e.clientY, startVh: heightVh };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [heightVh]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const deltaPx = dragRef.current.startY - e.clientY; // glisser vers le haut = agrandir
    const deltaVh = (deltaPx / window.innerHeight) * 100;
    const next = Math.min(maxVh, Math.max(minVh, dragRef.current.startVh + deltaVh));
    setHeightVh(next);
  }, [minVh, maxVh]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const reset = useCallback((vh = defaultVh) => setHeightVh(vh), [defaultVh]);

  return {
    heightVh,
    reset,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
