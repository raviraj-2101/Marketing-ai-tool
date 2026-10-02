import { Scene } from "@/hooks/useScenes";
import { Avatar } from "@/hooks/useAvatars";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SceneGridProps {
  scenes: Scene[];
  avatars: Avatar[];
  isLoading: boolean;
  onDelete: (id: string) => void;
}

export function SceneGrid({
  scenes,
  avatars,
  isLoading,
  onDelete,
}: SceneGridProps) {
  const getAvatarName = (avatarId: string) => {
    return avatars.find((a) => a.id === avatarId)?.name || "Unknown Avatar";
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-3">
              <Skeleton className="aspect-square rounded-lg mb-3" />
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No scenes yet. Select an avatar and create a scene.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {scenes.map((scene) => (
        <Card key={scene.id} className="group overflow-hidden">
          <CardContent className="p-3">
            <div className="relative aspect-square rounded-lg overflow-hidden mb-3">
              <img
                src={scene.image_url}
                alt={scene.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDelete(scene.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <h3 className="font-medium truncate">{scene.name}</h3>
            <p className="text-sm text-muted-foreground truncate">
              Avatar: {getAvatarName(scene.avatar_id)}
            </p>
            {scene.prompt && (
              <p className="text-xs text-muted-foreground truncate mt-1">
                {scene.prompt}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
