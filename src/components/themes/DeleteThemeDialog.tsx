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
import { Theme } from "@/hooks/useThemes";

interface DeleteThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme | null;
  onConfirm: () => void;
  isLoading: boolean;
}

export const DeleteThemeDialog = ({ open, onOpenChange, theme, onConfirm, isLoading }: DeleteThemeDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Theme</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{theme?.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {isLoading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
