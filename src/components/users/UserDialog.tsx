import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Eye, EyeOff, Loader2, X, Pencil, ChevronDown } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { useBrands } from "@/hooks/useBrands";
import { useAuth } from "@/hooks/useAuth";
import { User, UserFormData } from "@/hooks/useUsers";
import { ALL_BRANDS_SENTINEL } from "@/lib/brandAccess";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User | null;
  onSubmit: (data: UserFormData) => void;
  isLoading: boolean;
}

const USER_TYPES = ["Admin", "Dev", "Custom"];
const CUSTOM_ROLE_TYPES = ["CS", "Editor", "Media Buyer", "Copywriter"];

// CS and Editor carry a Main/Secondary level so the person lands in the right
// brands column (main_cs/secondary_cs/main_editor/secondary_editor) that the ad
// CS/Editor picker reads. The stored role string is e.g. "Main CS" / "Secondary Editor";
// Media Buyer / Copywriter have no level. "Main" is the default.
const LEVELED_ROLES = ["CS", "Editor"];
const combineRole = (base: string, level: string) =>
  LEVELED_ROLES.includes(base) ? `${level} ${base}` : base;
const splitRole = (stored: string): { base: string; level: string } => {
  const m = /^(Main|Secondary) (CS|Editor)$/.exec(stored);
  return m ? { base: m[2], level: m[1] } : { base: stored, level: "Main" };
};
const UGC_BUILDER_CS_ROUTES = [
  "/ugc-builder/generate-scripts",
  "/ugc-builder/batch-creator",
  "/ugc-builder/avatars",
  "/ugc-builder/video-build-log",
  "/ugc-builder/automations",
];

const ROLE_DEFAULT_ROUTES: Record<string, string[]> = {
  "Media Buyer": [
    "/ads-performance",
    "/ad-bank",
    "/ads-management/ads-db",
    "/ads-management/scripts",
    "/ads-management/tsl-scripts",
  ],
  "CS": [...UGC_BUILDER_CS_ROUTES],
  // Copywriters get the Ads Performance tab only (across all brands via the
  // All Brands option in handleAddBrandRole). Per client request: in-platform
  // metrics visibility.
  "Copywriter": ["/ads-performance"],
};

const ROUTE_PERMISSION_GROUPS = [
  {
    group: "Ads",
    items: [
      { title: "Ads Performance", url: "/ads-performance" },
      { title: "Ad Bank", url: "/ad-bank" },
      { title: "Pipeline Report", url: "/pipeline-report" },
      { title: "Editors Pace", url: "/editors-pace" },
      { title: "CS Pace", url: "/cs-pace" },
      { title: "CS KPIs", url: "/cs-kpis" },
      { title: "Spy Tool", url: "/spy-tool" },
    ],
  },
  {
    group: "Catalog",
    items: [
      { title: "Brands", url: "/brands" },
      { title: "Products", url: "/products" },
      { title: "Publishers", url: "/publishers" },
    ],
  },
  {
    group: "Ads Management",
    items: [
      { title: "Ads Db", url: "/ads-management/ads-db" },
      { title: "Scripts", url: "/ads-management/scripts" },
      { title: "TSL Scripts", url: "/ads-management/tsl-scripts" },
    ],
  },
  {
    group: "Statics Generator",
    items: [
      { title: "Config Module", url: "/config-module" },
      { title: "Ad Generator", url: "/ad-generator" },
      // { title: "TSL Generator", url: "/tsl-generator" },
      { title: "Pipeline Log", url: "/pipeline-log" },
    ],
  },
  // {
  //   group: "Video Builder",
  //   items: [
  //     { title: "Avatar Generation", url: "/video-builder/avatar-generation" },
  //     { title: "Avatar Configuration", url: "/video-builder/avatar-configuration" },
  //     { title: "Manage Scenes", url: "/video-builder/manage-scenes" },
  //     { title: "Create Videos", url: "/video-builder/create-videos" },
  //   ],
  // },
  {
    group: "TSL Builder",
    items: [
      { title: "Generate Scripts", url: "/tsl-builder/generate-scripts" },
      { title: "Develop TSL", url: "/tsl-builder/develop" },
      { title: "TSL Log", url: "/tsl-builder/tsl-log" },
      { title: "Settings", url: "/tsl-builder/settings" },
    ],
  },
  {
    group: "UGC Builder",
    items: [
      { title: "Generate Scripts", url: "/ugc-builder/generate-scripts" },
      { title: "Generate Video Ads", url: "/ugc-builder/batch-creator" },
      { title: "Avatars", url: "/ugc-builder/avatars" },
      { title: "Video Build Log", url: "/ugc-builder/video-build-log" },
      { title: "Automations", url: "/ugc-builder/automations" },
    ],
  },
  {
    group: "Ads Launcher",
    items: [
      { title: "Launch Module", url: "/ads-launcher/launch" },
      { title: "Launch Log", url: "/ads-launcher/log" },
      { title: "Meta Accounts", url: "/ads-launcher/accounts" },
      { title: "AdManage Library", url: "/ads-launcher/library" },
      { title: "Brands & Products", url: "/ads-launcher/brands-products" },
      { title: "Settings", url: "/ads-launcher/settings" },
    ],
  },
];

export const UserDialog = ({
  open,
  onOpenChange,
  user,
  onSubmit,
  isLoading,
}: UserDialogProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userType, setUserType] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [customRoleTypes, setCustomRoleTypes] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [brandRoles, setBrandRoles] = useState<Record<string, string>>({});
  const [selectedBrandForRole, setSelectedBrandForRole] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("Main");
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState("");
  const [editingLevel, setEditingLevel] = useState("Main");
  const [allowedRoutes, setAllowedRoutes] = useState<string[]>([]);
  const [openPermissionGroups, setOpenPermissionGroups] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);

  const { user: currentUser } = useAuth();
  const { data: brands = [] } = useBrands();

  // Filter user types based on caller's role
  const isEditingSelf = user && user.id === currentUser?.id;
  const isSuperAdmin = currentUser?.user_type?.includes("Super Admin");
  const isDevUser = currentUser?.user_type?.includes("Dev");
  const availableUserTypes = (isSuperAdmin || isDevUser)
    ? USER_TYPES
    : ["Dev", "Custom"];


  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || "");
      setLastName(user.last_name || "");
      setEmail(user.email);
      setPassword("");
      setUserType(user.user_type ?? []);
      setBrandIds(user.brand_ids ?? []);

      // Populate custom role types if user is Custom
      const customRoleTypes = user.custom_role_types ?? [];
      setCustomRoleTypes(customRoleTypes);

      // Convert custom_role_types array back to brandRoles object
      // Format: ["brandId:role"] → { brandId: "role" }
      const roles: Record<string, string> = {};
      customRoleTypes.forEach((assignment: string) => {
        const [brandId, role] = assignment.split(":");
        if (brandId && role) {
          roles[brandId] = role;
        }
      });
      setBrandRoles(roles);
      const savedRoutes = user.allowed_routes ?? [];
      setAllowedRoutes(savedRoutes);
      // Open groups that already have at least one route selected
      setOpenPermissionGroups(new Set(
        ROUTE_PERMISSION_GROUPS
          .filter(({ items }) => items.some((i) => savedRoutes.includes(i.url)))
          .map(({ group }) => group)
      ));
    } else {
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setUserType([]);
      setBrandIds([]);
      setCustomRoleTypes([]);
      setBrandRoles({});
      setAllowedRoutes([]);
      setOpenPermissionGroups(new Set());
    }
    setShowPassword(false);
    setSelectedBrandForRole("");
    setSelectedRole("");
    setSelectedLevel("Main");
    setShowErrors(false);
  }, [user, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);

    if (!isValid) {
      return;
    }

    // For Custom users, convert brandRoles to include role information
    const rolesArray = isCustomUser
      ? Object.entries(brandRoles).map(([brandId, role]) => `${brandId}:${role}`)
      : [];

    onSubmit({
      firstName,
      lastName,
      email,
      password,
      user_type: userType,
      brand_ids: Object.keys(brandRoles),
      custom_role_types: rolesArray,
      allowed_routes: isCustomUser ? allowedRoutes : [],
    });
  };

  const passwordError =
    password.length > 0 && password.length < 6
      ? "Password must be at least 6 characters"
      : null;

  const firstNameError = !firstName.trim() ? "First name is required" : null;
  const lastNameError = null;
  const emailError = !email.trim() ? "Email is required" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim() ? "Invalid email format" : null;
  const passwordRequiredError = !user && !password.trim() ? "Password is required for new users" : null;

  const isCustomUser = userType.includes("Custom");

  // Clear brand roles and allowed routes when Custom user type is removed
  useEffect(() => {
    if (!isCustomUser) {
      setBrandRoles({});
      setBrandIds([]);
      setCustomRoleTypes([]);
      setAllowedRoutes([]);
    }
  }, [isCustomUser]);

  // Pre-select default routes when a role with predefined access is chosen
  useEffect(() => {
    if (selectedRole && ROLE_DEFAULT_ROUTES[selectedRole]) {
      const defaults = ROLE_DEFAULT_ROUTES[selectedRole];
      setAllowedRoutes((prev) => {
        const merged = [...prev];
        defaults.forEach((route) => {
          if (!merged.includes(route)) merged.push(route);
        });
        return merged;
      });
      // Auto-open the groups that contain the default routes
      setOpenPermissionGroups((prev) => {
        const next = new Set(prev);
        ROUTE_PERMISSION_GROUPS.forEach(({ group, items }) => {
          if (items.some((i) => defaults.includes(i.url))) next.add(group);
        });
        return next;
      });
    }
  }, [selectedRole]);

  const handleAddBrandRole = () => {
    if (!selectedBrandForRole || !selectedRole) return;

    // "All Brands" is picked from the same Select Brand dropdown as a real brand
    // would be. It assigns the selected role to EVERY brand — current and any
    // created later — via a sentinel value rather than a snapshot of today's
    // brand ids, so a future brand never needs this user to be re-edited.
    // All-Brands is exclusive with per-brand assignments: picking it replaces
    // any existing per-brand roles for this user with the single sentinel entry.
    if (selectedBrandForRole === ALL_BRANDS_SENTINEL) {
      const role = combineRole(selectedRole, selectedLevel);
      setBrandRoles({ [ALL_BRANDS_SENTINEL]: role });
      setBrandIds([ALL_BRANDS_SENTINEL]);
      const defaults = ROLE_DEFAULT_ROUTES[selectedRole] ?? [];
      setAllowedRoutes((prev) => {
        const merged = [...prev];
        defaults.forEach((route) => {
          if (!merged.includes(route)) merged.push(route);
        });
        return merged;
      });
      setSelectedBrandForRole("");
      setSelectedRole("");
      setSelectedLevel("Main");
      return;
    }

    setBrandRoles((prev) => ({
      ...prev,
      [selectedBrandForRole]: combineRole(selectedRole, selectedLevel),
    }));
    setBrandIds((prev) =>
      prev.includes(selectedBrandForRole) ? prev : [...prev, selectedBrandForRole]
    );
    setSelectedBrandForRole("");
    setSelectedRole("");
    setSelectedLevel("Main");
  };

  const hasAllBrandsGrant = Object.prototype.hasOwnProperty.call(brandRoles, ALL_BRANDS_SENTINEL);

  const handleRemoveBrandRole = (brandId: string) => {
    setBrandRoles((prev) => {
      const newRoles = { ...prev };
      delete newRoles[brandId];
      return newRoles;
    });
    setBrandIds((prev) => prev.filter((id) => id !== brandId));
  };

  const handleEditBrandRole = (brandId: string, currentRole: string) => {
    const { base, level } = splitRole(currentRole);
    setEditingBrandId(brandId);
    setEditingRole(base);
    setEditingLevel(level);
  };

  const handleSaveEditBrandRole = () => {
    if (editingBrandId && editingRole) {
      setBrandRoles((prev) => ({
        ...prev,
        [editingBrandId]: combineRole(editingRole, editingLevel),
      }));
      setEditingBrandId(null);
      setEditingRole("");
      setEditingLevel("Main");
    }
  };

  const availableBrandsForRole = brands.filter((b) => !brandIds.includes(b.id) || selectedBrandForRole === b.id);

  const isValid =
    firstName.trim() &&
    email.trim() &&
    userType.length > 0 &&
    !passwordError &&
    (user ? true : password.trim().length >= 6) &&
    (!isCustomUser || Object.keys(brandRoles).length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {user ? "Edit User" : "Add User"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name <span className="text-destructive">*</span></Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
                className={showErrors && firstNameError ? "border-destructive" : ""}
              />
              {showErrors && firstNameError && (
                <p className="text-sm text-destructive">{firstNameError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
                className={showErrors && lastNameError ? "border-destructive" : ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email">Email <span className="text-destructive">*</span></Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className={showErrors && emailError ? "border-destructive" : ""}
            />
            {showErrors && emailError && (
              <p className="text-sm text-destructive">{emailError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">
              Password {user ? "(leave blank to keep current)" : <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <Input
                id="user-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  user ? "Enter new password to change" : "Enter password"
                }
                className={`pr-10 ${showErrors && (passwordError || passwordRequiredError) ? "border-destructive" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {showErrors && passwordRequiredError && (
              <p className="text-sm text-destructive">{passwordRequiredError}</p>
            )}
            {showErrors && passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>

          {(!isEditingSelf || isSuperAdmin) && (
            <div className="space-y-2">
              <Label>User Type <span className="text-destructive">*</span></Label>
              <MultiSelect
                options={availableUserTypes.map((ut) => ({
                  value: ut,
                  label: ut,
                }))}
                value={userType}
                onChange={setUserType}
                placeholder={
                  userType.length === 0
                    ? "Select user types..."
                    : `${userType.length} selected`
                }
              />
              {showErrors && userType.length === 0 && (
                <p className="text-sm text-destructive">
                  At least one user type must be selected
                </p>
              )}
            </div>
          )}

          {isCustomUser && (!isEditingSelf || isSuperAdmin) && (
            <>
              {hasAllBrandsGrant ? (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    All-Brands access is active for this user. Remove it below before
                    assigning individual brand roles.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="brand-select">Select Brand</Label>
                    <Select value={selectedBrandForRole} onValueChange={setSelectedBrandForRole}>
                      <SelectTrigger id="brand-select">
                        <SelectValue placeholder="Choose a brand..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_BRANDS_SENTINEL} className="font-medium">
                          All Brands (current &amp; future)
                        </SelectItem>
                        {availableBrandsForRole.map((brand) => (
                          <SelectItem key={brand.id} value={brand.id}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role-select">Secondary user type</Label>
                    <Select value={selectedRole} onValueChange={(v) => { setSelectedRole(v); setSelectedLevel("Main"); }}>
                      <SelectTrigger id="role-select">
                        <SelectValue placeholder="Choose a role..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOM_ROLE_TYPES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {LEVELED_ROLES.includes(selectedRole) && (
                    <div className="space-y-2">
                      <Label htmlFor="level-select">Main / Secondary</Label>
                      <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                        <SelectTrigger id="level-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Main">Main {selectedRole}</SelectItem>
                          <SelectItem value="Secondary">Secondary {selectedRole}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddBrandRole}
                    disabled={!selectedBrandForRole || !selectedRole}
                    className="w-full"
                  >
                    {selectedBrandForRole === ALL_BRANDS_SENTINEL
                      ? "Grant All Brands Access"
                      : "Add Brand Role"}
                  </Button>
                </div>
              )}

              {Object.keys(brandRoles).length > 0 && (
                <div className="space-y-2">
                  <Label>Assigned Secondary User type</Label>
                  <div className="space-y-2">
                    {Object.entries(brandRoles).map(([brandId, role]) => {
                      const isAllBrandsEntry = brandId === ALL_BRANDS_SENTINEL;
                      const brand = brands.find((b) => b.id === brandId);
                      const brandLabel = isAllBrandsEntry
                        ? "All Brands (current & future)"
                        : brand?.name;
                      const isEditing = editingBrandId === brandId;
                      return (
                        <div key={brandId} className="space-y-2">
                          {!isEditing ? (
                            <div className="flex items-center justify-between bg-muted p-2 rounded">
                              <span className="text-sm">
                                {brandLabel} - <span className="font-medium">{role}</span>
                              </span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEditBrandRole(brandId, role)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBrandRole(brandId)}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-muted p-2 rounded space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium flex-1">{brandLabel}</span>
                                <Select value={editingRole} onValueChange={(v) => { setEditingRole(v); setEditingLevel("Main"); }}>
                                  <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select role..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CUSTOM_ROLE_TYPES.map((r) => (
                                      <SelectItem key={r} value={r}>
                                        {r}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {LEVELED_ROLES.includes(editingRole) && (
                                  <Select value={editingLevel} onValueChange={setEditingLevel}>
                                    <SelectTrigger className="flex-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Main">Main</SelectItem>
                                      <SelectItem value="Secondary">Secondary</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleSaveEditBrandRole}
                                  className="flex-1"
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingBrandId(null)}
                                  className="flex-1"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {showErrors && isCustomUser && Object.keys(brandRoles).length === 0 && (
                <p className="text-sm text-destructive">
                  At least one brand role must be assigned for Custom users
                </p>
              )}

              {/* Route Permissions — independent section, shown when brand+role selected or roles already assigned */}
              {(selectedBrandForRole && selectedRole) || Object.keys(brandRoles).length > 0 ? (
                <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                  <div>
                    <Label className="text-sm font-semibold">Route Permissions</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Select which pages this user can access</p>
                    {selectedRole && ROLE_DEFAULT_ROUTES[selectedRole] && (
                      <p className="text-xs text-blue-600 mt-1">
                        Default routes for <span className="font-medium">{selectedRole}</span> are pre-selected. You can add or remove routes as needed.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    {ROUTE_PERMISSION_GROUPS.map(({ group, items }) => {
                      const groupUrls = items.map((i) => i.url);
                      const selectedCount = groupUrls.filter((url) => allowedRoutes.includes(url)).length;
                      const allSelected = selectedCount === groupUrls.length;
                      const noneSelected = selectedCount === 0;

                      const toggleGroup = () => {
                        if (allSelected) {
                          setAllowedRoutes((prev) => prev.filter((r) => !groupUrls.includes(r)));
                        } else {
                          setAllowedRoutes((prev) => {
                            const without = prev.filter((r) => !groupUrls.includes(r));
                            return [...without, ...groupUrls];
                          });
                        }
                      };

                      const toggleRoute = (url: string) => {
                        setAllowedRoutes((prev) =>
                          prev.includes(url) ? prev.filter((r) => r !== url) : [...prev, url]
                        );
                      };

                      const isOpen = openPermissionGroups.has(group);
                      const toggleOpen = () =>
                        setOpenPermissionGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group)) next.delete(group);
                          else next.add(group);
                          return next;
                        });

                      return (
                        <Collapsible key={group} open={isOpen} onOpenChange={toggleOpen}>
                          <div className="border rounded-md bg-background overflow-hidden">
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <Checkbox
                                id={`edit-group-${group}`}
                                checked={allSelected ? true : noneSelected ? false : "indeterminate"}
                                onCheckedChange={(checked) => {
                                  toggleGroup();
                                  if (checked !== false) {
                                    setOpenPermissionGroups((prev) => new Set(prev).add(group));
                                  }
                                }}
                              />
                              <label
                                htmlFor={`edit-group-${group}`}
                                className="text-xs font-semibold cursor-pointer select-none"
                              >
                                {group}
                              </label>
                              <CollapsibleTrigger asChild>
                                <button type="button" className="flex items-center gap-2 flex-1 justify-end hover:opacity-80 transition-opacity">
                                  {selectedCount > 0 && (
                                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                      {selectedCount}/{groupUrls.length}
                                    </span>
                                  )}
                                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                </button>
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 px-2.5 pb-2.5 pt-1 border-t">
                                {items.map(({ title, url }) => {
                                  const isDefault = selectedRole
                                    ? (ROLE_DEFAULT_ROUTES[selectedRole] ?? []).includes(url)
                                    : false;
                                  return (
                                    <div key={url} className="flex items-center gap-1.5">
                                      <Checkbox
                                        id={`edit-route-${url}`}
                                        checked={allowedRoutes.includes(url)}
                                        onCheckedChange={() => toggleRoute(url)}
                                      />
                                      <label htmlFor={`edit-route-${url}`} className="text-xs cursor-pointer select-none text-muted-foreground flex items-center gap-1">
                                        {title}
                                        {isDefault && (
                                          <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded leading-tight">default</span>
                                        )}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}


          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading
                ? user
                  ? "Updating..."
                  : "Creating..."
                : user
                  ? "Update User"
                  : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
