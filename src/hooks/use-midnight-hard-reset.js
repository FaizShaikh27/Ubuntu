"use client";

import { useEffect } from "react";
import { DAILY_RESET_KEY, localDayKey } from "@/src/lib/shell/fs.js";

const MIDNIGHT_GRACE_MS = 100;

function millisecondsUntilTomorrow(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, MIDNIGHT_GRACE_MS);
  return Math.max(0, tomorrow.getTime() - now.getTime());
}

/**
 * Hard-reset an active terminal at local midnight. The day check also runs
 * when a suspended/backgrounded tab becomes active again.
 */
export function useMidnightHardReset(fs) {
  useEffect(() => {
    let timeoutId;

    const scheduleNextReset = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        checkForReset();
      }, millisecondsUntilTomorrow());
    };

    const checkForReset = () => {
      if (fs.ensureDailyReset()) {
        window.location.reload();
        return;
      }
      scheduleNextReset();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForReset();
    };

    const handleStorage = (event) => {
      // Another tab performed today's reset. Reload this tab too so its
      // in-memory filesystem and running processes cannot restore stale data.
      if (
        event.key === DAILY_RESET_KEY &&
        event.oldValue !== null &&
        event.newValue === localDayKey() &&
        event.newValue !== event.oldValue
      ) {
        window.location.reload();
      }
    };

    checkForReset();
    window.addEventListener("focus", checkForReset);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("focus", checkForReset);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [fs]);
}
