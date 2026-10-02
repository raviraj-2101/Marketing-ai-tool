import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface User {
  id: string;
  name: string;
  email: string;
  user_type: string[];
}

interface Brand {
  id: string;
  name: string;
  main_cs: string[];
  secondary_cs: string[];
  coordinator: string[];
  editor: string[];
}

interface UserRoleAssignment {
  email: string;
  name: string;
  brandRoles: Record<string, {
    main_cs: boolean;
    secondary_cs: boolean;
    coordinator: boolean;
    editor: boolean;
  }>;
}

interface AssignUsersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  onAssign: (assignments: Record<string, UserRoleAssignment>) => Promise<void>;
}

const ROLE_TYPES = [
  { id: "main_cs", label: "Main CS" },
  { id: "secondary_cs", label: "Secondary CS" },
  { id: "coordinator", label: "Coordinator" },
  { id: "editor", label: "Editor" },
];

export const AssignUsersModal = ({
  open,
  onOpenChange,
  brands,
  onAssign,
}: AssignUsersModalProps) => {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, UserRoleAssignment>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Custom users
  useEffect(() => {
    if (open) {
      fetchCustomUsers();
    } else {
      // Reset form when modal closes
      setSelectedUsers([]);
      setAssignments({});
    }
  }, [open]);

  const fetchCustomUsers = async () => {
    setIsLoading(true);
    try {
      const token = getToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "list" }),
        }
      );

      const data = await response.json();
      if (data.users) {
        const customUsers = data.users.filter(
          (u: User) => u.user_type?.includes("Custom")
        );
        setUsers(customUsers);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserSelection = (userId: string, email: string, name: string) => {
    setSelectedUsers((prev) => {
      const newSelected = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId];

      // Initialize assignments for newly selected users
      if (!prev.includes(userId)) {
        // Fetch existing role assignments for this user
        fetchUserRoleAssignments(userId, email, name, brands);
      } else {
        // Remove assignments for deselected users
        setAssignments((prevAssignments) => {
          const newAssignments = { ...prevAssignments };
          delete newAssignments[userId];
          return newAssignments;
        });
      }

      return newSelected;
    });
  };

  const fetchUserRoleAssignments = (
    userId: string,
    email: string,
    name: string,
    brandsData: Brand[]
  ) => {
    const normalizedEmail = email.toLowerCase().trim();

    // Build brandRoles based on existing assignments
    const brandRoles: Record<string, any> = {};
    brandsData.forEach((brand) => {
      brandRoles[brand.id] = {
        main_cs: false,
        secondary_cs: false,
        coordinator: false,
        editor: false,
      };
    });

    // Check which roles this email has in each brand
    brandsData.forEach((brand) => {
      if (brandRoles[brand.id]) {
        // Normalize emails in arrays for case-insensitive comparison
        const mainCsEmails = (brand.main_cs || []).map((e: string) => e.toLowerCase().trim());
        const secondaryCsEmails = (brand.secondary_cs || []).map((e: string) => e.toLowerCase().trim());
        const coordinatorEmails = (brand.coordinator || []).map((e: string) => e.toLowerCase().trim());
        const editorEmails = (brand.editor || []).map((e: string) => e.toLowerCase().trim());

        if (mainCsEmails.includes(normalizedEmail)) {
          brandRoles[brand.id].main_cs = true;
        }
        if (secondaryCsEmails.includes(normalizedEmail)) {
          brandRoles[brand.id].secondary_cs = true;
        }
        if (coordinatorEmails.includes(normalizedEmail)) {
          brandRoles[brand.id].coordinator = true;
        }
        if (editorEmails.includes(normalizedEmail)) {
          brandRoles[brand.id].editor = true;
        }
      }
    });

    // Update assignments with existing data
    setAssignments((prev) => ({
      ...prev,
      [userId]: {
        email,
        name,
        brandRoles,
      },
    }));
  };

  const toggleRole = (userId: string, brandId: string, roleId: string) => {
    setAssignments((prev) => {
      const userAssignment = prev[userId];
      const currentValue = userAssignment.brandRoles[brandId][roleId as keyof typeof userAssignment.brandRoles[brandId]];

      return {
        ...prev,
        [userId]: {
          ...userAssignment,
          brandRoles: {
            ...userAssignment.brandRoles,
            [brandId]: {
              ...userAssignment.brandRoles[brandId],
              [roleId]: !currentValue,
            },
          },
        },
      };
    });
  };

  const hasRoleAssigned = (userId: string): boolean => {
    const assignment = assignments[userId];
    if (!assignment) return false;
    return Object.values(assignment.brandRoles).some((brandRoles) =>
      Object.values(brandRoles).some((v) => v)
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onAssign(assignments);
      onOpenChange(false);
      setSelectedUsers([]);
      setAssignments({});
    } catch (err) {
      console.error("Failed to save assignments:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = selectedUsers.length > 0 && selectedUsers.some(hasRoleAssigned);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Assign Users to Brand Roles</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-8">
            {/* User Selection Section */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Step 1: Select Users
              </h3>
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading users...
                  </div>
                ) : users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Custom users found</p>
                ) : (
                  users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={() =>
                          toggleUserSelection(user.id, user.email, user.name)
                        }
                      />
                      <Label
                        htmlFor={`user-${user.id}`}
                        className="flex-1 cursor-pointer font-medium"
                      >
                        <span className="block text-foreground">{user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Role Assignment Section */}
            {selectedUsers.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Step 2: Assign Roles
                </h3>
                <div className="space-y-6">
                  {selectedUsers.map((userId) => {
                    const user = users.find((u) => u.id === userId);
                    const assignment = assignments[userId];
                    if (!user || !assignment) return null;

                    return (
                      <div
                        key={userId}
                        className="rounded-lg border border-border bg-card p-4 space-y-4"
                      >
                        <div className="font-medium text-foreground">{user.name}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {brands.map((brand) => (
                            <div key={brand.id} className="space-y-3 p-3 rounded-lg bg-muted/30">
                              <div className="font-medium text-sm text-foreground">
                                {brand.name}
                              </div>
                              <div className="space-y-2">
                                {ROLE_TYPES.map((role) => (
                                  <div
                                    key={role.id}
                                    className="flex items-center space-x-2"
                                  >
                                    <Checkbox
                                      id={`role-${userId}-${brand.id}-${role.id}`}
                                      checked={assignment.brandRoles[brand.id]?.[role.id as keyof typeof assignment.brandRoles[string]] ?? false}
                                      onCheckedChange={() => toggleRole(userId, brand.id, role.id)}
                                    />
                                    <Label
                                      htmlFor={`role-${userId}-${brand.id}-${role.id}`}
                                      className="text-sm cursor-pointer font-normal"
                                    >
                                      {role.label}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Assign Users
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
