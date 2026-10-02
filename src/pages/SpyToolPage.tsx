import { useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";

export default function SpyToolPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { getToken } = useAuth();
  const VITE_SPY_TOOL_URL= import.meta.env.VITE_SPY_TOOL_URL;

  useEffect(() => {
    const token = getToken();
    
    if (token && iframeRef.current) {
      // Forward the parent page's query params (e.g. ?ad=<id> share links) to the
      // embedded spy tool, then add the SSO token. Without this, deep links to a
      // specific ad were dropped at the iframe boundary.
      const params = new URLSearchParams(window.location.search);
      params.set("sso_token", token);
      const iframeUrl = `${VITE_SPY_TOOL_URL}?${params.toString()}`;
      iframeRef.current.src = iframeUrl;
      console.log("🚀 ~ iframe src set with token");
    } else {
      console.warn("🚀 ~ Cannot set iframe - missing token or ref");
    }
  }, [getToken]);

  return (
    <DashboardLayout>
      <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
        <iframe
          ref={iframeRef}
          src={VITE_SPY_TOOL_URL}
          className="w-full flex-1 border-0"
          title="Spy Tool"
          allow="autoplay; fullscreen; clipboard-write"
        />
      </div>
    </DashboardLayout>
  );
}
