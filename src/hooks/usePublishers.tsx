import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessages";

export interface Publisher {
  id: string;
  name: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublisherFormData {
  name: string;
  imageFile?: File;
  existingImageUrl?: string | null;
}

export const usePublishers = () => {
  const queryClient = useQueryClient();

  const { data: publishers, isLoading } = useQuery({
    queryKey: ["publishers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publishers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Publisher[];
    },
  });

  const uploadImage = async (file: File, publisherId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${publisherId}/image.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from("publisher-images")
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("publisher-images").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const createPublisher = useMutation({
    mutationFn: async (formData: PublisherFormData) => {
      const { data: publisher, error } = await supabase
        .from("publishers")
        .insert([{ name: formData.name }])
        .select()
        .single();

      if (error) throw error;

      if (formData.imageFile) {
        const imageUrl = await uploadImage(formData.imageFile, publisher.id);
        await supabase
          .from("publishers")
          .update({ image_url: imageUrl })
          .eq("id", publisher.id);
      }

      return publisher;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publishers"] });
      toast.success("Publisher created successfully");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "publisher"));
    },
  });

  const updatePublisher = useMutation({
    mutationFn: async ({ id, ...formData }: PublisherFormData & { id: string }) => {
      let imageUrl = formData.existingImageUrl;

      if (formData.imageFile) {
        imageUrl = await uploadImage(formData.imageFile, id);
      }

      const { error } = await supabase
        .from("publishers")
        .update({ name: formData.name, image_url: imageUrl })
        .eq("id", id);

      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publishers"] });
      toast.success("Publisher updated successfully");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "publisher"));
    },
  });

  const deletePublisher = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("publishers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publishers"] });
      toast.success("Publisher deleted successfully");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "publisher"));
    },
  });

  return {
    publishers,
    isLoading,
    createPublisher,
    updatePublisher,
    deletePublisher,
  };
};
