import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePublishers, Publisher } from "@/hooks/usePublishers";
import { PublisherDialog } from "@/components/publishers/PublisherDialog";
import { DeletePublisherDialog } from "@/components/publishers/DeletePublisherDialog";

const Publishers = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPublisher, setSelectedPublisher] = useState<Publisher | null>(null);

  const { publishers, isLoading } = usePublishers();

  const filteredPublishers = publishers?.filter((publisher) =>
    publisher.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleEdit = (publisher: Publisher) => {
    setSelectedPublisher(publisher);
    setDialogOpen(true);
  };

  const handleDelete = (publisher: Publisher) => {
    setSelectedPublisher(publisher);
    setDeleteDialogOpen(true);
  };

  const handleAddNew = () => {
    setSelectedPublisher(null);
    setDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="page-title">Publishers</h1>
            <p className="page-description">Manage your publisher network</p>
          </div>
          <Button onClick={handleAddNew}>
            <Plus className="w-4 h-4 mr-2" />
            Add Publisher
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">All Publishers</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search publishers..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading publishers...</div>
            ) : filteredPublishers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? "No publishers found matching your search." : "No publishers yet. Add your first publisher!"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPublishers.map((publisher) => (
                    <TableRow key={publisher.id}>
                      <TableCell>
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={publisher.image_url || undefined} alt={publisher.name} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {publisher.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{publisher.name}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(publisher)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(publisher)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <PublisherDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        publisher={selectedPublisher}
      />

      <DeletePublisherDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        publisher={selectedPublisher}
      />
    </DashboardLayout>
  );
};

export default Publishers;
