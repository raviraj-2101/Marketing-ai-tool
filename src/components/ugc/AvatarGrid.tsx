import { Avatar } from "@/hooks/useAvatars";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Clapperboard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AvatarGridProps {
  avatars: Avatar[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onCreateScene: (avatar: Avatar) => void;
}

export function AvatarGrid({
  avatars,
  isLoading,
  onDelete,
  onCreateScene,
}: AvatarGridProps) {
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

  if (avatars.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No avatars yet. Create your first avatar to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {avatars.map((avatar) => (
        <Card key={avatar.id} className="group overflow-hidden">
          <CardContent className="p-3">
            <div className="relative aspect-square rounded-lg overflow-hidden mb-3">
              <img
                src={avatar.image_url}
                alt={avatar.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onCreateScene(avatar)}
                >
                  <Clapperboard className="w-4 h-4 mr-1" />
                  Scene
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDelete(avatar.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <h3 className="font-medium truncate">{avatar.name}</h3>
            {avatar.description && (
              <p className="text-sm text-muted-foreground truncate">
                {avatar.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
