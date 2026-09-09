import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Only the latest still-open profile request may publish into this viewer/screen. */
export function useProfileRequestState<T>(scope: string) {
  const [state, setState] = useState<{ scope: string; value: T | null }>({ scope, value: null });
  const generation = useRef(0);
  // Reset during this component's render so the previous viewer never flashes.
  if (state.scope !== scope) setState({ scope, value: null });
  useLayoutEffect(() => () => { generation.current += 1; }, [scope]);
  const set = useCallback((next: T | null) => {
    generation.current += 1;
    setState({ scope, value: next });
  }, [scope]);
  const begin = useCallback((loading: T) => {
    const request = ++generation.current;
    setState({ scope, value: loading });
    const isCurrent = () => request === generation.current;
    return {
      isCurrent,
      publish(next: T) {
        if (!isCurrent()) return;
        // React may process this updater after close/navigation: recheck there too.
        setState(current => isCurrent() && current.scope === scope && current.value !== null
          ? { scope, value: next } : current);
      },
    };
  }, [scope]);
  return { value: state.scope === scope ? state.value : null, set, begin };
}
