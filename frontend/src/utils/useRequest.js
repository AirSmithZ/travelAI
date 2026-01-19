import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from './debounce';

/**
 * 极简版 useRequest（不依赖 ahooks）
 * - manual: 手动触发
 * - debounceWait: 防抖（仅对 run 生效）
 * - onSuccess/onError
 */
export function useRequest(service, options = {}) {
  const {
    manual = false,
    debounceWait = 0,
    onSuccess,
    onError,
  } = options;

  const serviceRef = useRef(service);
  serviceRef.current = service;

  const [loading, setLoading] = useState(!manual);
  const [data, setData] = useState(undefined);
  const [error, setError] = useState(null);

  const runCore = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const res = await serviceRef.current(...args);
      setData(res);
      onSuccess?.(res, args);
      return res;
    } catch (e) {
      setError(e);
      onError?.(e, args);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [onError, onSuccess]);

  const run = useMemo(() => {
    if (!debounceWait) return runCore;
    const d = debounce(runCore, debounceWait);
    return d;
  }, [runCore, debounceWait]);

  useEffect(() => {
    if (manual) return;
    runCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading, data, error, run, runAsync: runCore };
}

