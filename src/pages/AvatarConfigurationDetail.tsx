import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Video, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL as string;

const SAMPLE_SCRIPT =
  "Hi! Looking for something smarter and faster? We've got just what you need.Try it today and see the difference!";

interface Avatar {
  id: string;
  name: string;
  image_url: string;
  heygen_avatar_id?: string | null;
}

type VideoStatus = 'idle' | 'creating_video' | 'polling' | 'completed' | 'failed';

export default function AvatarConfigurationDetail() {
  const { avatarId } = useParams<{ avatarId: string }>();
  const navigate = useNavigate();

  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [loadingAvatar, setLoadingAvatar] = useState(true);

  const [voiceName, setVoiceName] = useState('');
  const [voiceId, setVoiceId] = useState('');

  const [videoStatus, setVideoStatus] = useState<VideoStatus>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [confirmingVoice, setConfirmingVoice] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!avatarId) return;
    const fetchAvatar = async () => {
      try {
        const { data, error } = await supabase
          .from('avatars')
          .select('id, name, image_url, heygen_avatar_id')
          .eq('id', avatarId)
          .single();

        if (error) throw error;
        setAvatar(data as unknown as Avatar);
      } catch (error) {
        console.error('Error fetching avatar:', error);
        toast.error('Failed to load avatar');
      } finally {
        setLoadingAvatar(false);
      }
    };
    fetchAvatar();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [avatarId]);

  const pollForVideo = (videoId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/get-heygen-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_id: videoId }),
        });
        const json = await res.json();
        const d = json?.data;

        if (d?.status === 'completed') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setVideoUrl(d.video_url ?? null);
          setVideoStatus('completed');
          toast.success('Sample video is ready!');
        } else if (d?.status === 'failed') {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setVideoStatus('failed');
          toast.error('Sample video generation failed');
        }
      } catch {
        // keep polling on transient errors
      }
    }, 10000);
  };

  const handleGenerateSampleVideo = async () => {
    if (!voiceName.trim()) {
      toast.error('Voice Name is required');
      return;
    }
    if (!voiceId.trim()) {
      toast.error('Voice ID is required');
      return;
    }
    if (!avatar?.heygen_avatar_id) {
      toast.error('This avatar has no HeyGen avatar ID yet. Upload it to HeyGen first via Avatar Generation.');
      return;
    }

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setVideoUrl(null);
    setVideoStatus('creating_video');

    try {
      // Step 1 — create the sample video
      const videoRes = await fetch(`${API_BASE_URL}/api/create-heygen-avatar-sample-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_id: voiceId.trim(),
          heygen_avatar_id: avatar.heygen_avatar_id,
          title: avatar.name,
          script: SAMPLE_SCRIPT,
        }),
      });
      if (!videoRes.ok) throw new Error(`Sample video creation failed: ${videoRes.statusText}`);
      const videoJson = await videoRes.json();
      const videoId: string = videoJson?.video_id;
      if (!videoId) throw new Error('No video_id returned from sample video API');

      // Step 2 — poll until done
      setVideoStatus('polling');
      pollForVideo(videoId);
    } catch (error) {
      console.error('Error generating sample video:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate sample video');
      setVideoStatus('failed');
    }
  };

  const handleConfirmVoice = async () => {
    if (!avatarId) return;
    setConfirmingVoice(true);
    try {
      const { error } = await supabase
        .from('avatars')
        .update({ heygen_voice_id: voiceId, voice_name: voiceName, is_configure : 'TRUE' })
        .eq('id', avatarId);
      if (error) throw error;
      toast.success('Voice configuration saved!');
      navigate('/video-builder/avatar-configuration');
    } catch (error) {
      console.error('Error saving voice configuration:', error);
      toast.error('Failed to save voice configuration');
    } finally {
      setConfirmingVoice(false);
    }
  };

  const isGenerating = ['creating_video', 'polling'].includes(videoStatus);

  const statusLabel: Record<VideoStatus, string> = {
    idle: 'Generate Sample Video',
    creating_video: 'Creating video…',
    polling: 'Processing video…',
    completed: 'Regenerate Sample Video',
    failed: 'Retry Sample Video',
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/video-builder/avatar-configuration')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Avatar Configuration</h1>
            {avatar && (
              <p className="text-muted-foreground text-sm mt-0.5">{avatar.name}</p>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left — Voice configuration form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voice Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {loadingAvatar ? (
                <div className="space-y-4">
                  <div className="h-9 bg-muted rounded animate-pulse" />
                  <div className="h-9 bg-muted rounded animate-pulse" />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="voiceName">
                      Voice Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="voiceName"
                      placeholder="Enter voice name"
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      disabled={isGenerating}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="voiceId">
                      Voice ID <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="voiceId"
                      placeholder="Enter HeyGen Voice ID"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      disabled={isGenerating}
                    />
                  </div>

                  <Button
                    className="w-full gap-2"
                    onClick={handleGenerateSampleVideo}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Video className="w-4 h-4" />
                    )}
                    {statusLabel[videoStatus]}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Right — Sample video preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sample Video</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-center min-h-[160px]">
                {videoStatus === 'idle' && (
                  <p className="text-muted-foreground text-sm">Sample video will appear here</p>
                )}
                {isGenerating && (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm">{statusLabel[videoStatus]}</p>
                  </div>
                )}
                {videoStatus === 'failed' && (
                  <p className="text-destructive text-sm">Video generation failed. Please retry.</p>
                )}
                {videoStatus === 'completed' && videoUrl && (
                  <video
                    src={videoUrl}
                    controls
                    className="w-full rounded-lg max-h-60 object-contain"
                  />
                )}
                {videoStatus === 'completed' && !videoUrl && (
                  <p className="text-muted-foreground text-sm">Video completed but no URL available.</p>
                )}
              </div>

              {videoStatus === 'completed' && (
                <Button
                  className="w-full gap-2"
                  onClick={handleConfirmVoice}
                  disabled={confirmingVoice}
                >
                  {confirmingVoice && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmingVoice ? 'Saving…' : 'Confirm Voice'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
