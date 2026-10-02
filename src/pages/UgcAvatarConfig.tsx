import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { AvatarLooksCard, type AvatarWithLooks } from "@/components/ugc/AvatarLooksCard";
import { RefreshCw, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_SERVER_URL as string;

export default function UgcAvatarConfig() {
  const { toast } = useToast();
  const [avatars, setAvatars] = useState<AvatarWithLooks[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAvatars = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/ugc-avatars`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { avatars: data } = await res.json();
      setAvatars(data ?? []);
    } catch (err: any) {
      toast({ title: "Failed to load avatars", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchAvatars(); }, [fetchAvatars]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Avatar Config</h1>
            <p className="text-sm text-muted-foreground">
              Manage looks (scene pairs) for each avatar. A look pairs a P1 (without product) and P2 (with product) HeyGen avatar ID.
            </p>
          </div>
          <Button variant="outline" onClick={() => fetchAvatars(true)} disabled={refreshing} className="shrink-0">
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : avatars.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No configured avatars found. Set <code>is_configure = true</code> on an avatar to have it appear here.
          </p>
        ) : (
          <div className="space-y-4">
            {avatars.map((av) => (
              <AvatarLooksCard
                key={av.id}
                avatar={av}
                onUpdated={() => fetchAvatars(true)}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
