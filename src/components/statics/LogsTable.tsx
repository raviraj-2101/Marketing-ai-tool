import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGenerationLogs, useUpdateGenerationLog, GenerationLog } from "@/hooks/useGenerationLogs";
import { useInspos } from "@/hooks/useInspos";
import { FileText, ExternalLink, Copy, Image as ImageIcon, Link2 } from "lucide-react";
import { format } from "date-fns";

interface LogsTableProps {
  onUseAsTemplate: (log: GenerationLog) => void;
}

const LogsTable = ({ onUseAsTemplate }: LogsTableProps) => {
  const { data: logs = [], isLoading } = useGenerationLogs();
  const { inspos = [] } = useInspos();
  const updateLogMutation = useUpdateGenerationLog();
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const handleStatusChange = async (logId: string, newStatus: string) => {
    await updateLogMutation.mutateAsync({
      id: logId,
      status: newStatus,
    });
  };

  // Get inspo name from drive_link
  const getInspoNameByLink = (link: string) => {
    const inspo = inspos.find((i) => i.drive_link === link);
    return inspo?.name || "Unknown";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Loading logs...</p>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generation Logs</CardTitle>
          <CardDescription>View your generation history</CardDescription>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No generation logs yet.</p>
          <p className="text-sm text-muted-foreground">
            Start generating content to see your history here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generation Logs</CardTitle>
        <CardDescription>View your generation history and use logs as templates</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[80px]">ID</TableHead>
                <TableHead className="min-w-[100px]">Status</TableHead>
                <TableHead className="min-w-[120px]">Brand</TableHead>
                <TableHead className="min-w-[120px]">Product</TableHead>
                <TableHead className="min-w-[100px]">Date</TableHead>
                <TableHead className="min-w-[100px]">Time</TableHead>
                <TableHead className="min-w-[100px]">Ad Type</TableHead>
                <TableHead className="min-w-[80px]">CS</TableHead>
                <TableHead className="min-w-[120px]">Concept Name</TableHead>
                <TableHead className="min-w-[120px]">Theme</TableHead>
                <TableHead className="min-w-[100px]">Prompt</TableHead>
                <TableHead className="min-w-[100px]">Images</TableHead>
                <TableHead className="min-w-[100px]">Drive Link</TableHead>
                <TableHead className="min-w-[80px]">Inspo</TableHead>
                <TableHead className="min-w-[130px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {String(log.display_id).padStart(6, '0')}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={log.status}
                      onValueChange={(value) => handleStatusChange(log.id, value)}
                    >
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="In Work">
                          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">In Work</span>
                        </SelectItem>
                        <SelectItem value="Ready">
                          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground">Ready</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="font-medium">{log.brand_name}</TableCell>
                  <TableCell>{log.product_name}</TableCell>
                  <TableCell>
                    {format(new Date(log.generation_date), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell>
                    {format(new Date(log.generation_timestamp), "HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.variant === "onbrand" ? "outline" : "secondary"}>
                      {log.variant === "onbrand" ? "Onbrand" : "Comparison"}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.cs || "-"}</TableCell>
                  <TableCell>{log.concept_name || "-"}</TableCell>
                  <TableCell>{log.theme_name}</TableCell>
                  <TableCell>
                    {log.prompt ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <FileText className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Prompt Content</DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="max-h-[400px]">
                            <div 
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: log.prompt }}
                            />
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {log.selected_images && log.selected_images.length > 0 ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <ImageIcon className="w-4 h-4 mr-1" />
                            {log.selected_images.length}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>Reference Images</DialogTitle>
                          </DialogHeader>
                          <div className="grid grid-cols-3 gap-4 mt-4">
                            {log.selected_images.map((url, index) => (
                              <div key={index} className="aspect-square rounded-lg overflow-hidden border">
                                <img
                                  src={url}
                                  alt={`Reference ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {log.drive_link ? (
                      <a
                        href={log.drive_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-primary hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {log.inspo_links && log.inspo_links.length > 0 ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1">
                            <Link2 className="w-4 h-4" />
                            <span className="text-xs">{log.inspo_links.length}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3" align="start">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-foreground mb-2">Inspiration Links</p>
                            {log.inspo_links.map((link, index) => (
                              <div 
                                key={index} 
                                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                              >
                                <span className="text-sm truncate flex-1">
                                  {getInspoNameByLink(link)}
                                </span>
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80 shrink-0"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onUseAsTemplate(log)}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Use as Template
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default LogsTable;
