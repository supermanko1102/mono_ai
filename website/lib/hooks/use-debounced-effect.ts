import { useEffect } from "react";

export function useDebouncedEffect(
  effect: () => void,
  delayMs: number,
  deps: readonly unknown[]
) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      effect();
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, ...deps]);
}
