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
import { useInspos, Inspo } from "@/hooks/useInspos";

interface DeleteInspoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspo: Inspo | null;
}

export const DeleteInspoDialog = ({ open, onOpenChange, inspo }: DeleteInspoDialogProps) => {
  const { deleteInspo } = useInspos();

  const handleDelete = async () => {
    if (!inspo) return;
    
    try {
      await deleteInspo.mutateAsync(inspo.id);
      onOpenChange(false);
    } catch (error) {
      // Error handled in hook
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Inspo</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{inspo?.name}"? This action cannot be undone.
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
