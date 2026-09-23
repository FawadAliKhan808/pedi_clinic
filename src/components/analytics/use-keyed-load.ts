"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/format";

type Loaded<T> = { key: string; data: T } | { key: string; error: string };

/**
 * Loads whatever `key` names and keeps the last good frame while the next
 * one is in flight — so a filter change dims the charts instead of blanking
 * them. `stale` is true while the shown data belongs to an older key.
 */
export function useKeyedLoad<T>(key: string | null, load: () => Promise<T>) {
  const [result, setResult] = useState<Loaded<T> | null>(null);
  const [lastData, setLastData] = useState<T | null>(null);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (cancelled) return;
        setResult({ key, data });
        setLastData(data);
      })
      .catch((caught) => {
        if (!cancelled) setResult({ key, error: errorMessage(caught) });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = result?.key === key ? result : null;
  return {
    data: current && "data" in current ? current.data : lastData,
    error: current && "error" in current ? current.error : null,
    stale: current === null,
  };
}
