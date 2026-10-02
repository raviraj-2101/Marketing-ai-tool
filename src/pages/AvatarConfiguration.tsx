import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Settings2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Avatar {
  id: string;
  name: string;
  image_url: string;
  is_configure: boolean;
  created_at: string;
}

export default function AvatarConfiguration() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchAvatars();
  }, [user]);

  const fetchAvatars = async () => {
    try {
      const { data, error } = await supabase
        .from('avatars')
        .select('id, name, image_url, is_configure, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvatars((data as Avatar[]) || []);
    } catch (error) {
      console.error('Error fetching avatars:', error);
      toast.error('Failed to fetch avatars');
    } finally {
      setLoading(false);
    }
  };

  const removeConfiguration = async (avatarId: string) => {
    try {
      const { error } = await supabase
        .from('avatars')
        .update({ is_configure: false })
        .eq('id', avatarId);

      if (error) throw error;
      setAvatars((prev) =>
        prev.map((a) => (a.id === avatarId ? { ...a, is_configure: false } : a))
      );
      toast.success('Configuration removed');
    } catch (error) {
      console.error('Error removing configuration:', error);
      toast.error('Failed to remove configuration');
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Avatar Configuration</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure voice settings for each avatar before video production.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avatars</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : avatars.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                No avatars found. Create avatars in Avatar Generation first.
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[700px]">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-16">Avatar</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Created At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center ">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {avatars.map((avatar) => (
                      <TableRow key={avatar.id}>
                        <TableCell>
                          <img
                            src={avatar.image_url}
                            alt={avatar.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{avatar.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(avatar.created_at)}
                        </TableCell>
                        <TableCell>
                          {avatar.is_configure ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Configured
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">
                              Not Configured
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {avatar.is_configure ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setRemoveTargetId(avatar.id)}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Remove
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() =>
                                navigate(`/video-builder/avatar-configuration/${avatar.id}`)
                              }
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                              Configure
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!removeTargetId} onOpenChange={(open) => { if (!open) setRemoveTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the configuration for this avatar? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (removeTargetId) removeConfiguration(removeTargetId);
                setRemoveTargetId(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
