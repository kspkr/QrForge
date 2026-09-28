import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Run an async loader and track { data, error, loading }. Re-runs when deps change.
 * `reload()` re-runs manually; `setData` allows optimistic updates.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const counter = useRef(0);

  const run = useCallback(async () => {
    const id = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      if (id === counter.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === counter.current) setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: run, setData };
}
