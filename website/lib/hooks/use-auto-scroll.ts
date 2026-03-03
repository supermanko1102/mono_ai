import { useEffect } from "react";
import type { RefObject } from "react";

export function useAutoScroll(
  ref: RefObject<HTMLElement | null>,
  options: {
    enabled: boolean;
    deps: readonly unknown[];
  }
) {
  const { enabled, deps } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const element = ref.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [enabled, ref, ...deps]);
}
