import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, ChevronDown } from "lucide-react";
import { Brand } from "@/hooks/useBrands";
import { User } from "@/hooks/useUsers";

interface BrandCsTableProps {
  brand: Brand;
  eligibleUsers: User[];
  allUsers: User[];
  canEdit: boolean;
  onAssignMainCs: (brandId: string, email: string) => void;
  onRemoveMainCs: (brandId: string, email: string) => void;
  onAssignSecondaryCs: (brandId: string, email: string) => void;
  onRemoveSecondaryCs: (brandId: string, email: string) => void;
  onAssignMainEditor: (brandId: string, email: string) => void;
  onRemoveMainEditor: (brandId: string, email: string) => void;
  onAssignSecondaryEditor: (brandId: string, email: string) => void;
  onRemoveSecondaryEditor: (brandId: string, email: string) => void;
  isLoading: boolean;
  /** "row" = desktop table row (default), "card" = mobile stacked card. */
  layout?: "row" | "card";
}

export const BrandCsTable = ({
  brand,
  eligibleUsers,
  allUsers,
  canEdit,
  onAssignMainCs,
  onRemoveMainCs,
  onAssignSecondaryCs,
  onRemoveSecondaryCs,
  onAssignMainEditor,
  onRemoveMainEditor,
  onAssignSecondaryEditor,
  onRemoveSecondaryEditor,
  isLoading,
  layout = "row",
}: BrandCsTableProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper to get user's role type for this brand (CS or Editor)
  const getUserRoleType = (user: User | null): string => {
    if (!user) return "";
    const roleEntry = user.custom_role_types?.find((rt) => rt.startsWith(`${brand.id}:`));
    return roleEntry ? roleEntry.split(":")[1] : "";
  };

  // Helper to check if user has a specific role
  const hasRoleType = (user: User, roleType: string): boolean => {
    return user.custom_role_types?.some((rt) => rt === `${brand.id}:${roleType}`) || false;
  };

  // CS Logic
  const mainCsEmails = brand.main_cs || [];
  const mainCsUsers = mainCsEmails
    .map((email) => ({
      email,
      user: allUsers.find((u) => u.email.trim().toLowerCase() === email.trim().toLowerCase()),
    }))
    .sort((a, b) => {
      if (a.user && !b.user) return -1;
      if (!a.user && b.user) return 1;
      return 0;
    });

  const secondaryCsEmails = brand.secondary_cs || [];
  const secondaryCsUsers = secondaryCsEmails
    .map((email) => ({
      email,
      user: allUsers.find((u) => u.email.trim().toLowerCase() === email.trim().toLowerCase()),
    }))
    .sort((a, b) => {
      if (a.user && !b.user) return -1;
      if (!a.user && b.user) return 1;
      return 0;
    });

  const assignedMainCsEmails = new Set(mainCsEmails.map((e) => e.toLowerCase()));
  const assignedSecondaryEmails = new Set(secondaryCsEmails.map((e) => e.toLowerCase()));
  const availableForMainCs = eligibleUsers.filter(
    (u) =>
      hasRoleType(u, "CS") &&
      !assignedMainCsEmails.has(u.email.toLowerCase()) &&
      !assignedSecondaryEmails.has(u.email.toLowerCase())
  );
  const availableForSecondary = eligibleUsers.filter(
    (u) =>
      hasRoleType(u, "CS") &&
      !assignedMainCsEmails.has(u.email.toLowerCase()) &&
      !assignedSecondaryEmails.has(u.email.toLowerCase())
  );

  // Editor Logic
  const mainEditorEmails = brand.main_editor || [];
  const mainEditorUsers = mainEditorEmails
    .map((email) => ({
      email,
      user: allUsers.find((u) => u.email.trim().toLowerCase() === email.trim().toLowerCase()),
    }))
    .sort((a, b) => {
      if (a.user && !b.user) return -1;
      if (!a.user && b.user) return 1;
      return 0;
    });

  const secondaryEditorEmails = brand.secondary_editor || [];
  const secondaryEditorUsers = secondaryEditorEmails
    .map((email) => ({
      email,
      user: allUsers.find((u) => u.email.trim().toLowerCase() === email.trim().toLowerCase()),
    }))
    .sort((a, b) => {
      if (a.user && !b.user) return -1;
      if (!a.user && b.user) return 1;
      return 0;
    });

  const assignedMainEditorEmails = new Set(mainEditorEmails.map((e) => e.toLowerCase()));
  const assignedSecondaryEditorEmails = new Set(secondaryEditorEmails.map((e) => e.toLowerCase()));
  const availableForMainEditor = eligibleUsers.filter(
    (u) =>
      hasRoleType(u, "Editor") &&
      !assignedMainEditorEmails.has(u.email.toLowerCase()) &&
      !assignedSecondaryEditorEmails.has(u.email.toLowerCase())
  );
  const availableForSecondaryEditor = eligibleUsers.filter(
    (u) =>
      hasRoleType(u, "Editor") &&
      !assignedMainEditorEmails.has(u.email.toLowerCase()) &&
      !assignedSecondaryEditorEmails.has(u.email.toLowerCase())
  );

  // ---- Shared per-assignment rendering (used by both the table row + the mobile card) ----

  type AssignmentList = { email: string; user: User | undefined }[];

  // The "add" control: count chip + Select of available users. `fullWidth` lets the
  // mobile card stretch the trigger for easier tapping.
  const renderAddControl = (
    countChipClass: string,
    count: number,
    available: User[],
    onAssign: (brandId: string, email: string) => void,
    fullWidth = false,
    showCount = true
  ) => (
    <div className="flex items-center gap-2">
      {showCount && (
        <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${countChipClass}`}>
          {count}
        </span>
      )}
      {canEdit && (
        <Select
          value="adding"
          onValueChange={(email) => {
            if (email !== "adding") {
              onAssign(brand.id, email);
            }
          }}
          disabled={isLoading || available.length === 0}
        >
          <SelectTrigger
            className={`${fullWidth ? "flex-1" : "w-32"} h-8 text-xs border-border disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed`}
          >
            <SelectValue placeholder={available.length === 0 ? "None to add" : "Select User"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((user) => (
              <SelectItem key={user.id} value={user.email}>
                {user.first_name} {user.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  // The assigned-user list: per-user chip (name + role badge) + remove button.
  const renderAssignedList = (
    list: AssignmentList,
    badgeClass: string,
    onRemove: (brandId: string, email: string) => void
  ) => {
    const assigned = list.filter((u) => u.user);
    if (assigned.length === 0) {
      return <p className="text-xs text-muted-foreground italic">No users assigned</p>;
    }
    return assigned.map(({ email, user }) => (
      <div
        key={email}
        className="flex items-center justify-between text-sm bg-muted/30 p-2 rounded hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <p className="font-medium">
            {user.first_name} {user.last_name}
          </p>
          <span className={`px-1.5 py-0.5 text-xs font-semibold rounded ${badgeClass}`}>
            {getUserRoleType(user)}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={() => onRemove(brand.id, email)}
            disabled={isLoading}
            className="text-destructive hover:text-destructive/80 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    ));
  };

  // ---- Mobile card layout ----
  if (layout === "card") {
    const sections = [
      {
        title: "Main CS",
        accent: "border-purple-400",
        countChip: "bg-purple-100 text-purple-800",
        badge: "bg-purple-200 text-purple-700",
        list: mainCsUsers,
        available: availableForMainCs,
        count: mainCsUsers.filter((u) => u.user).length,
        onAssign: onAssignMainCs,
        onRemove: onRemoveMainCs,
      },
      {
        title: "Secondary CS",
        accent: "border-blue-400",
        countChip: "bg-blue-100 text-blue-800",
        badge: "bg-blue-200 text-blue-700",
        list: secondaryCsUsers,
        available: availableForSecondary,
        count: secondaryCsUsers.filter((u) => u.user).length,
        onAssign: onAssignSecondaryCs,
        onRemove: onRemoveSecondaryCs,
      },
      {
        title: "Main Editor",
        accent: "border-orange-400",
        countChip: "bg-orange-100 text-orange-800",
        badge: "bg-orange-200 text-orange-700",
        list: mainEditorUsers,
        available: availableForMainEditor,
        count: mainEditorUsers.filter((u) => u.user).length,
        onAssign: onAssignMainEditor,
        onRemove: onRemoveMainEditor,
      },
      {
        title: "Secondary Editor",
        accent: "border-green-400",
        countChip: "bg-green-100 text-green-800",
        badge: "bg-green-200 text-green-700",
        list: secondaryEditorUsers,
        available: availableForSecondaryEditor,
        count: secondaryEditorUsers.filter((u) => u.user).length,
        onAssign: onAssignSecondaryEditor,
        onRemove: onRemoveSecondaryEditor,
      },
    ];

    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        {/* Brand header */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="font-semibold text-foreground">{brand.name}</span>
          <span className="px-2 py-0.5 bg-muted text-xs font-medium rounded text-muted-foreground">
            {brand.brand_code}
          </span>
        </div>

        {/* Assignment sections */}
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.title} className={`border-l-4 ${s.accent} pl-3`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="font-semibold text-sm">{s.title}</h4>
                <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ${s.countChip}`}>
                  {s.count}
                </span>
              </div>
              <div className="space-y-2 mb-2">
                {renderAssignedList(s.list, s.badge, s.onRemove)}
              </div>
              {renderAddControl(s.countChip, s.count, s.available, s.onAssign, true, false)}
            </div>
          ))}
        </div>

        {/* Users */}
        <div className="mt-4 pt-3 border-t">
          <span className="px-2 py-1 bg-muted rounded text-xs font-medium text-muted-foreground">
            {eligibleUsers.length} eligible users
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <TableRow
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            <ChevronDown
              className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
            />
            <span>{brand.name}</span>
            <span className="px-2 py-0.5 bg-muted text-xs font-medium rounded text-muted-foreground">
              {brand.brand_code}
            </span>
          </div>
        </TableCell>

      {/* Main CS */}
      <TableCell>
        {renderAddControl(
          "bg-purple-100 text-purple-800",
          mainCsUsers.filter((u) => u.user).length,
          availableForMainCs,
          onAssignMainCs
        )}
      </TableCell>

      {/* Secondary CS */}
      <TableCell>
        {renderAddControl(
          "bg-blue-100 text-blue-800",
          secondaryCsUsers.filter((u) => u.user).length,
          availableForSecondary,
          onAssignSecondaryCs
        )}
      </TableCell>

      {/* Main Editor */}
      <TableCell>
        {renderAddControl(
          "bg-orange-100 text-orange-800",
          mainEditorUsers.filter((u) => u.user).length,
          availableForMainEditor,
          onAssignMainEditor
        )}
      </TableCell>

      {/* Secondary Editor */}
      <TableCell>
        {renderAddControl(
          "bg-green-100 text-green-800",
          secondaryEditorUsers.filter((u) => u.user).length,
          availableForSecondaryEditor,
          onAssignSecondaryEditor
        )}
      </TableCell>

      {/* Users Count */}
      <TableCell className="text-sm text-muted-foreground">
        <span className="px-2 py-1 bg-muted rounded text-xs font-medium">
          {eligibleUsers.length} eligible
        </span>
      </TableCell>

    </TableRow>

    {isExpanded && (
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={7} className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Main CS List */}
            <div className="border-l-4 border-purple-400 pl-4">
              <h4 className="font-semibold text-sm mb-3">Main CS</h4>
              <div className="space-y-2">
                {renderAssignedList(mainCsUsers, "bg-purple-200 text-purple-700", onRemoveMainCs)}
              </div>
            </div>

            {/* Secondary CS List */}
            <div className="border-l-4 border-blue-400 pl-4">
              <h4 className="font-semibold text-sm mb-3">Secondary CS</h4>
              <div className="space-y-2">
                {renderAssignedList(secondaryCsUsers, "bg-blue-200 text-blue-700", onRemoveSecondaryCs)}
              </div>
            </div>

            {/* Main Editor List */}
            <div className="border-l-4 border-orange-400 pl-4">
              <h4 className="font-semibold text-sm mb-3">Main Editor</h4>
              <div className="space-y-2">
                {renderAssignedList(mainEditorUsers, "bg-orange-200 text-orange-700", onRemoveMainEditor)}
              </div>
            </div>

            {/* Secondary Editor List */}
            <div className="border-l-4 border-green-400 pl-4">
              <h4 className="font-semibold text-sm mb-3">Secondary Editor</h4>
              <div className="space-y-2">
                {renderAssignedList(secondaryEditorUsers, "bg-green-200 text-green-700", onRemoveSecondaryEditor)}
              </div>
            </div>

          </div>
        </TableCell>
      </TableRow>
    )}
    </>
  );
};
