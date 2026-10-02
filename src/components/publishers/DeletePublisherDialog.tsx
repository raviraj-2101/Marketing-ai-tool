import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePublishers, Publisher } from "@/hooks/usePublishers";

interface DeletePublisherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publisher: Publisher | null;
}

export const DeletePublisherDialog = ({ open, onOpenChange, publisher }: DeletePublisherDialogProps) => {
  const { deletePublisher } = usePublishers();

  const handleDelete = async () => {
    if (!publisher) return;
    
    try {
      await deletePublisher.mutateAsync(publisher.id);
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Publisher</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{publisher?.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
