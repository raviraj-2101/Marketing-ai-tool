import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useInspos, Inspo } from "@/hooks/useInspos";
import { InspoDialog } from "@/components/inspo/InspoDialog";
import { DeleteInspoDialog } from "@/components/inspo/DeleteInspoDialog";

const InspoPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedInspo, setSelectedInspo] = useState<Inspo | null>(null);

  const { inspos, isLoading } = useInspos();

  const filteredInspos = inspos?.filter((inspo) =>
    inspo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    setSelectedInspo(null);
    setDialogOpen(true);
  };

  const handleEdit = (inspo: Inspo) => {
    setSelectedInspo(inspo);
    setDialogOpen(true);
  };

  const handleDelete = (inspo: Inspo) => {
    setSelectedInspo(inspo);
    setDeleteDialogOpen(true);
  };


  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Inspo</h1>
            <p className="page-description">Manage your inspiration links</p>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Inspo
          </Button>
        </div>

        <div className="flex items-center mb-6">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search inspiration..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inspo Name</TableHead>
                <TableHead>Funnel</TableHead>
                <TableHead>Link to Drive</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredInspos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No inspiration items found. Add your first one!
                  </TableCell>
                </TableRow>
              ) : (
                filteredInspos?.map((inspo) => (
                  <TableRow key={inspo.id}>
                    <TableCell className="font-medium">{inspo.name}</TableCell>
                    <TableCell className="capitalize">{(inspo.funnel_type || []).join(", ")}</TableCell>
                    <TableCell>
                      <a
                        href={inspo.drive_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-primary hover:underline"
                      >
                        <span className="truncate max-w-[300px] inline-block align-middle">
                          {inspo.drive_link}
                        </span>
                        <ExternalLink className="w-4 h-4 ml-2 flex-shrink-0" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(inspo)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(inspo)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <InspoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        inspo={selectedInspo}
      />

      <DeleteInspoDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        inspo={selectedInspo}
      />
    </DashboardLayout>
  );
};

export default InspoPage;
