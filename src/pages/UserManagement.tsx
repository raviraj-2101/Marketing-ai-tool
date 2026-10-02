import { useState, useMemo, Fragment } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ALL_BRANDS_SENTINEL } from "@/lib/brandAccess";
import anyAscii from "any-ascii";
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
import {
  Plus,
  Search,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
  ShieldCheck,
  Crown,
  Code,
  ArrowDownAZ,
  ArrowUpZA,
} from "lucide-react";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  User,
  UserFormData,
} from "@/hooks/useUsers";
import { useAuth } from "@/hooks/useAuth";
import { useBrands } from "@/hooks/useBrands";
import { supabase } from "@/integrations/supabase/client";
import { UserDialog } from "@/components/users/UserDialog";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function getInitials(firstName: string, lastName: string): string {
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join("");
  return initials.toUpperCase().slice(0, 2) || "?";
}

function getAvatarColor(firstName: string, lastName: string): string {
  const firstChar = firstName?.[0] || lastName?.[0] || "";
  const idx = firstChar?.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

// Transliterate any script (Cyrillic, Greek, accented Latin, …) to plain ASCII so names group and
// sort by how they READ, not by raw codepoint — e.g. a mistyped Cyrillic "К" in "Кlaus" → "Klaus".
const asciiKey = (s: string): string => anyAscii(s).trim();

// The A–Z bucket for a name; anything that doesn't transliterate to A–Z (digits, symbols, scripts
// with no Latin form) → "#" (pinned last, like a phone contacts app).
function firstLetter(name: string): string {
  const ch = asciiKey(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

function UserTypeBadges({ userTypes }: { userTypes: string[] }) {
  const typeColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    "Super Admin": {
      bg: "bg-red-100",
      text: "text-red-800",
      icon: <Crown className="w-3 h-3" />,
    },
    Admin: { bg: "bg-purple-100", text: "text-purple-800", icon: <ShieldCheck className="w-3 h-3" /> },
    Dev: { bg: "bg-blue-100", text: "text-blue-800", icon: <Code className="w-3 h-3" /> },
    Custom: { bg: "bg-emerald-100", text: "text-emerald-800", icon: <Users className="w-3 h-3" /> },
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {userTypes.map((type) => {
        const colors = typeColors[type] || typeColors["Custom"];
        return (
          <span
            key={type}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
          >
            {colors.icon}
            {type}
          </span>
        );
      })}
    </div>
  );
}

const ROLE_STYLES: Record<string, string> = {
  CS: "bg-blue-50 text-blue-700 border-blue-100",
  Editor: "bg-violet-50 text-violet-700 border-violet-100",
  "Media Buyer": "bg-amber-50 text-amber-700 border-amber-100",
  Copywriter: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

// Secondary roles grouped by role: one colored role pill + its brands as a "·"-joined list, so a
// CS-on-5-brands user reads as a single line instead of five "Brand - CS" rows. Shared by the
// desktop table and the mobile cards.
function SecondaryUserTypes({ customRoleTypes, brands }: { customRoleTypes: string[]; brands: any[] }) {
  if (!customRoleTypes || customRoleTypes.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const byRole = new Map<string, string[]>();
  for (const assignment of customRoleTypes) {
    const [brandId, rawRole] = assignment.split(":");
    // Show the base role only (strip the Main/Secondary level): "Main Editor" → "Editor".
    const role = (rawRole ?? "").replace(/^(Main|Secondary) /, "");
    // The All-Brands grant is a sentinel, not a real brand id, so there is no
    // brands row to resolve a name from — label it explicitly instead of "—".
    const brand = brands.find((b) => b.id === brandId);
    const label =
      brandId === ALL_BRANDS_SENTINEL ? "All Brands" : brand?.name || "—";
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(label);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {Array.from(byRole.entries()).map(([role, brandNames]) => (
        <div key={role} className="flex items-start gap-2">
          <span
            className={cn(
              "shrink-0 text-[11px] font-semibold rounded-md px-1.5 py-0.5 border leading-tight",
              ROLE_STYLES[role] ?? "bg-muted text-muted-foreground border-border"
            )}
          >
            {role}
          </span>
          <span className="text-xs text-muted-foreground leading-relaxed">
            {brandNames.join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  colorClass,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  colorClass: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      className={cn(
        "cursor-pointer transition-colors hover:border-border/80",
        active && "border-primary/60 bg-primary/[0.04]"
      )}
    >
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Compact stat chip for the mobile stats strip (the full StatCards are desktop-only).
function StatChip({
  icon: Icon,
  label,
  value,
  iconColor,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  iconColor: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors",
        active ? "border-primary/60 bg-primary/[0.06]" : "border-border bg-card hover:bg-muted/50"
      )}
    >
      <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      <span className="text-sm font-bold text-foreground leading-none">{value}</span>
      <span className="text-xs text-muted-foreground leading-none">{label}</span>
    </button>
  );
}

const UserManagement = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [grouping, setGrouping] = useState<"none" | "az" | "za">("none");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { data: allUsers = [], isLoading } = useUsers();
  const { data: brands = [] } = useBrands();
  const { user: currentUser } = useAuth();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  // Clicking a stat toggles a role filter; "all" (Total) clears it.
  const toggleRole = (role: string) =>
    setRoleFilter((prev) => (role === "all" ? "all" : prev === role ? "all" : role));

  const filteredUsers = useMemo(
    () =>
      allUsers.filter((user) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          !query ||
          user.first_name.toLowerCase().includes(query) ||
          user.last_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query);
        const matchesRole = roleFilter === "all" || user.user_type?.includes(roleFilter);
        return matchesSearch && matchesRole;
      }),
    [allUsers, searchQuery, roleFilter]
  );

  // Grouping cycles none → A–Z → Z–A → none.
  const grouped = grouping !== "none";
  const cycleGrouping = () =>
    setGrouping((g) => (g === "none" ? "az" : g === "az" ? "za" : "none"));

  // When grouped: [letter, users][] like a phone contacts list. Names that don't start with a
  // Latin letter go in a "#" bucket pinned LAST. Letter groups AND the users inside them follow
  // the chosen direction (A–Z or Z–A); the group order is sorted explicitly (not by insertion).
  const groupedUsers = useMemo(() => {
    const dir = grouping === "za" ? -1 : 1;
    const nameOf = (u: User) => getFullName(u.first_name, u.last_name).trim();
    const cmp = (a: string, b: string) =>
      asciiKey(a).toLowerCase().localeCompare(asciiKey(b).toLowerCase(), "en", { numeric: true });

    const map = new Map<string, User[]>();
    for (const u of filteredUsers) {
      const letter = firstLetter(nameOf(u));
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(u);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => dir * cmp(nameOf(a), nameOf(b)));
    }
    const letters = Array.from(map.keys()).sort((a, b) => {
      if (a === "#") return 1;   // "#" always sorts to the bottom
      if (b === "#") return -1;
      return dir * cmp(a, b);
    });
    return letters.map((l) => [l, map.get(l)!] as [string, User[]]);
  }, [filteredUsers, grouping]);

  const stats = {
    superAdmin: allUsers.filter((u) => u.user_type?.includes("Super Admin")).length,
    admin: allUsers.filter((u) => u.user_type?.includes("Admin")).length,
    dev: allUsers.filter((u) => u.user_type?.includes("Dev")).length,
    custom: allUsers.filter((u) => u.user_type?.includes("Custom")).length,
    total: allUsers.length,
  };

  const handleCreate = () => {
    setSelectedUser(null);
    setDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setDialogOpen(true);
  };

  const handleDelete = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async (formData: UserFormData) => {
    if (selectedUser) {
      // Handle removing user from brand CS fields when roles are removed
      const oldCustomRoles = selectedUser.custom_role_types || [];
      const newCustomRoles = formData.custom_role_types || [];

      // Parse old and new role assignments
      const oldRoles = new Set(oldCustomRoles.map((r: string) => r.split(":")[0]));
      const newRoles = new Set(newCustomRoles.map((r: string) => r.split(":")[0]));

      // Find brands where user was removed
      const removedBrandIds = Array.from(oldRoles).filter(brandId => !newRoles.has(brandId));

      // Remove user's email from removed brand CS fields
      for (const brandId of removedBrandIds) {
        const brand = brands.find(b => b.id === brandId);
        if (brand) {
          const normalizedEmail = selectedUser.email.toLowerCase().trim();
          const updatedMainCs = (brand.main_cs || []).filter(
            (email: string) => email.toLowerCase().trim() !== normalizedEmail
          );
          const updatedSecondaryCs = (brand.secondary_cs || []).filter(
            (email: string) => email.toLowerCase().trim() !== normalizedEmail
          );

          await supabase
            .from('brands')
            .update({ main_cs: updatedMainCs, secondary_cs: updatedSecondaryCs })
            .eq('id', brandId);
        }
      }

      updateUser.mutate(
        { id: selectedUser.id, formData },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createUser.mutate(formData, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleConfirmDelete = () => {
    if (selectedUser) {
      deleteUser.mutate(selectedUser, {
        onSuccess: () => setDeleteDialogOpen(false),
      });
    }
  };

  // Admin can edit their own profile or other non-Admin/Super Admin users
  const canEditUser = (user: User): boolean => {
    // Can always edit self
    if (user.id === currentUser?.id) {
      return true;
    }
    if (currentUser?.user_type?.includes("Super Admin")) {
      return true;
    }
    if (currentUser?.user_type?.includes("Admin") || currentUser?.user_type?.includes("Dev")) {
      return !(
        user.user_type?.includes("Admin") ||
        user.user_type?.includes("Super Admin")
      );
    }
    return false;
  };

  // Delete permissions: cannot delete self or Super Admin users
  const canDeleteUser = (user: User): boolean => {
    // Cannot delete self
    if (user.id === currentUser?.id) {
      return false;
    }
    // Nobody can delete Super Admin users
    if (user.user_type?.includes("Super Admin")) {
      return false;
    }
    if (currentUser?.user_type?.includes("Super Admin")) {
      return true; // Super Admin can delete Admin, Dev, Custom
    }
    if (currentUser?.user_type?.includes("Admin") || currentUser?.user_type?.includes("Dev")) {
      return !user?.user_type?.includes("Admin"); // Admin/Dev can delete Dev/Custom, not other Admins
    }
    return false; // Others cannot delete
  };

  // Shared per-row actions (edit/delete dropdown) reused by the desktop table + mobile cards
  const renderRowActions = (user: User) =>
    (currentUser?.user_type?.includes("Super Admin") || currentUser?.user_type?.includes("Admin") || currentUser?.user_type?.includes("Dev")) && (canEditUser(user) || canDeleteUser(user)) ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            {/* vertical kebab on mobile, horizontal on desktop */}
            <MoreVertical className="w-4 h-4 md:hidden" />
            <MoreHorizontal className="w-4 h-4 hidden md:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEditUser(user) && (
            <DropdownMenuItem onClick={() => handleEdit(user)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
          {canDeleteUser(user) && (
            <DropdownMenuItem
              onClick={() => handleDelete(user)}
              className="text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  // Desktop table row — role badge sits next to the name (no separate User Type column).
  const renderDesktopRow = (user: User) => (
    <TableRow key={user.id}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${getAvatarColor(user.first_name, user.last_name)}`}
          >
            {getInitials(user.first_name, user.last_name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-foreground leading-tight">
                {getFullName(user.first_name, user.last_name)}
              </p>
              <UserTypeBadges userTypes={user.user_type ?? []} />
            </div>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <SecondaryUserTypes customRoleTypes={user.custom_role_types ?? []} brands={brands} />
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </TableCell>
      <TableCell>{renderRowActions(user)}</TableCell>
    </TableRow>
  );

  // Mobile card — role badge next to the name; secondary roles as chips; joined date bottom-right.
  const renderMobileCard = (user: User) => {
    const secondary = user.custom_role_types ?? [];
    return (
      <div key={user.id} className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${getAvatarColor(user.first_name, user.last_name)}`}
          >
            {getInitials(user.first_name, user.last_name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold text-foreground leading-tight truncate">
                {getFullName(user.first_name, user.last_name)}
              </p>
              <div className="shrink-0">
                <UserTypeBadges userTypes={user.user_type ?? []} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <div className="flex-shrink-0 -mr-1 -mt-1">{renderRowActions(user)}</div>
        </div>

        {secondary.length > 0 && (
          <div className="mt-3">
            <SecondaryUserTypes customRoleTypes={secondary} brands={brands} />
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground text-right">
          Joined {new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
        </p>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        {/* Header — title left, Add User top-right next to the title (compact on all sizes) */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="page-title">User Management</h1>
            <p className="page-description">
              Manage application users and their roles
            </p>
          </div>
          {(currentUser?.user_type?.includes("Super Admin") || currentUser?.user_type?.includes("Admin") || currentUser?.user_type?.includes("Dev")) && (
            <Button onClick={handleCreate} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          )}
        </div>

        {/* Stats — click to filter by role. Compact chips on mobile, full cards on desktop. */}
        <div className="sm:hidden flex flex-wrap gap-2 mb-6">
          <StatChip icon={Users}       label="Total"       value={stats?.total}      iconColor="text-primary"     active={roleFilter === "all"}         onClick={() => toggleRole("all")} />
          <StatChip icon={Crown}       label="Super Admin" value={stats?.superAdmin} iconColor="text-red-500"     active={roleFilter === "Super Admin"} onClick={() => toggleRole("Super Admin")} />
          <StatChip icon={ShieldCheck} label="Admin"       value={stats?.admin}      iconColor="text-purple-500"  active={roleFilter === "Admin"}       onClick={() => toggleRole("Admin")} />
          <StatChip icon={Code}        label="Dev"         value={stats?.dev}        iconColor="text-blue-500"    active={roleFilter === "Dev"}         onClick={() => toggleRole("Dev")} />
          <StatChip icon={Users}       label="Custom"      value={stats?.custom}     iconColor="text-emerald-500" active={roleFilter === "Custom"}      onClick={() => toggleRole("Custom")} />
        </div>
        <div className="hidden sm:grid sm:grid-cols-5 gap-4 mb-8">
          <StatCard icon={Users}       label="Total Users"  value={stats?.total}      colorClass="bg-primary"     active={roleFilter === "all"}         onClick={() => toggleRole("all")} />
          <StatCard icon={Crown}       label="Super Admins" value={stats?.superAdmin} colorClass="bg-red-500"     active={roleFilter === "Super Admin"} onClick={() => toggleRole("Super Admin")} />
          <StatCard icon={ShieldCheck} label="Admins"       value={stats?.admin}      colorClass="bg-purple-500"  active={roleFilter === "Admin"}       onClick={() => toggleRole("Admin")} />
          <StatCard icon={Code}        label="Devs"         value={stats?.dev}        colorClass="bg-blue-500"    active={roleFilter === "Dev"}         onClick={() => toggleRole("Dev")} />
          <StatCard icon={Users}       label="Custom"       value={stats?.custom}     colorClass="bg-emerald-500" active={roleFilter === "Custom"}      onClick={() => toggleRole("Custom")} />
        </div>

        {/* Search + A–Z grouping toggle */}
        <div className="mb-6 flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant={grouping === "none" ? "outline" : "default"}
            size="icon"
            onClick={cycleGrouping}
            title={
              grouping === "none"
                ? "Group A–Z"
                : grouping === "az"
                ? "Grouped A–Z — tap for Z–A"
                : "Grouped Z–A — tap to clear"
            }
            aria-label="Cycle A–Z / Z–A grouping"
            className="shrink-0"
          >
            {grouping === "za" ? <ArrowUpZA className="w-4 h-4" /> : <ArrowDownAZ className="w-4 h-4" />}
          </Button>
        </div>

        {/* Table card — on mobile the cards stand alone (no parent card wrapper); the
            card chrome only applies from md+ where the desktop table lives inside it. */}
        <Card className="border-0 bg-transparent shadow-none rounded-none md:rounded-lg md:border md:bg-card md:shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-16 text-muted-foreground">
                Loading users...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                {searchQuery
                  ? "No users match your search."
                  : "No users yet. Click 'Add User' to create one."}
              </div>
            ) : (
              <>
                {/* Desktop table (>=768px), with a safety contained horizontal scroll */}
                <div className="hidden md:block w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Secondary User Type</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped
                        ? groupedUsers.map(([letter, users]) => (
                            <Fragment key={letter}>
                              <TableRow className="hover:bg-transparent border-0">
                                <TableCell colSpan={4} className="bg-muted/40 py-1.5 text-xs font-bold text-muted-foreground">
                                  {letter}
                                </TableCell>
                              </TableRow>
                              {users.map(renderDesktopRow)}
                            </Fragment>
                          ))
                        : filteredUsers.map(renderDesktopRow)}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile user cards (<768px) — stand-alone cards (no parent card) */}
                <div className="md:hidden flex flex-col gap-3">
                  {grouped
                    ? groupedUsers.map(([letter, users]) => (
                        <Fragment key={letter}>
                          <p className="text-xs font-bold text-muted-foreground px-1 pt-2 -mb-1">{letter}</p>
                          {users.map(renderMobileCard)}
                        </Fragment>
                      ))
                    : filteredUsers.map(renderMobileCard)}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={selectedUser}
        onSubmit={handleSubmit}
        isLoading={createUser.isPending || updateUser.isPending}
      />

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
        onConfirm={handleConfirmDelete}
        isLoading={deleteUser.isPending}
      />
    </DashboardLayout>
  );
};

export default UserManagement;
