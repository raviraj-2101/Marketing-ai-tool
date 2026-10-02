import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toast";

export function useLaunchPackageErrorHandler() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  return useCallback(
    (e: any) => {
      const msg = String(e?.message ?? "");
      if (/^404\b|Not Found|\bNot found/i.test(msg)) {
        toast("error", "This launch was deleted (likely in another tab). Returning to the log.");
        qc.invalidateQueries({ queryKey: ["launches"] });
        setTimeout(() => nav("/ads-launcher/log"), 800);
      } else {
        toast("error", msg || "Action failed");
      }
    },
    [qc, nav, toast],
  );
}
