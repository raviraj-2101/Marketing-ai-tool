import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Users, Crown, UserCheck } from "lucide-react";
import { useBrandCsAssignment } from "@/hooks/useBrandCsAssignment";
import { useAuth } from "@/hooks/useAuth";
import { BrandCsTable } from "@/components/cs-editors/BrandCsTable";

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  colorClass: string;
}

function StatCard({ icon: Icon, label, value, colorClass }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
        <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xl sm:text-2xl font-bold text-foreground leading-none">{value}</p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-tight mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const CsEditors = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const { user: currentUser } = useAuth();
  const {
    brands,
    users,
    brandsLoading,
    usersLoading,
    getEligibleCsUsers,
    assignMainCs,
    removeMainCs,
    assignSecondaryCs,
    removeSecondaryCs,
    assignMainEditor,
    removeMainEditor,
    assignSecondaryEditor,
    removeSecondaryEditor,
  } = useBrandCsAssignment();

  const canEdit =
    currentUser?.user_type?.includes("Super Admin") ||
    currentUser?.user_type?.includes("Admin") ||
    currentUser?.user_type?.includes("Dev");

  const filteredBrands = brands?.filter((brand) => {
    const query = searchQuery?.trim().toLowerCase();
    return (
      brand.name?.toLowerCase()?.includes(query) ||
      brand.brand_code?.toLowerCase()?.includes(query)
    );
  });

  const brandsWithCs = brands?.filter(
    (b) => (b.main_cs?.length || 0) > 0 || (b.secondary_cs?.length || 0) > 0
  ).length;

  const mainCsCount = new Set(brands?.flatMap(b => b.main_cs || []))?.size;

  const secondaryCount = brands?.reduce(
    (sum, b) => sum + (b.secondary_cs?.length || 0),
    0
  );

  const mainEditorCount = new Set(brands?.flatMap(b => b.main_editor || [])).size;

  const isLoading =
    usersLoading ||
    assignMainCs.isPending ||
    removeMainCs.isPending ||
    assignSecondaryCs.isPending ||
    removeSecondaryCs.isPending ||
    assignMainEditor.isPending ||
    removeMainEditor.isPending ||
    assignSecondaryEditor.isPending ||
    removeSecondaryEditor.isPending;

  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-y-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="page-title">CSs & Editors List</h1>
          <p className="page-description">
            Configure Main and Secondary CS and Editor assignments per brand
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <StatCard
            icon={Users}
            label="Brands Configured"
            value={brandsWithCs}
            colorClass="bg-primary"
          />
          <StatCard
            icon={Crown}
            label="Main CS Assigned"
            value={mainCsCount}
            colorClass="bg-violet-500"
          />
          <StatCard
            icon={UserCheck}
            label="Secondary CS"
            value={secondaryCount}
            colorClass="bg-blue-500"
          />
          <StatCard
            icon={Crown}
            label="Main Editor Assigned"
            value={mainEditorCount}
            colorClass="bg-orange-500"
          />
          <StatCard
            icon={UserCheck}
            label="Secondary Editor"
            value={brands.reduce((sum, b) => sum + (b.secondary_editor?.length || 0), 0)}
            colorClass="bg-green-500"
          />
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search brands..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Table (desktop) / stacked cards (mobile). Outer card is only a card on md+
            so the mobile brand cards don't nest inside a second card. */}
        <Card className="border-0 bg-transparent shadow-none md:border md:bg-card md:shadow-sm">
          <CardContent className="p-0">
            {brandsLoading ? (
              <div className="text-center py-16 text-muted-foreground">
                Loading brands...
              </div>
            ) : filteredBrands.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                {searchQuery
                  ? "No brands match your search."
                  : "No brands available."}
              </div>
            ) : (
              <>
                {/* Desktop table (>=768px) with a safety contained horizontal scroll */}
                <div className="hidden md:block w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Main CS</TableHead>
                        <TableHead>Secondary CS</TableHead>
                        <TableHead>Main Editor</TableHead>
                        <TableHead>Secondary Editor</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBrands.map((brand) => (
                        <BrandCsTable
                          key={brand.id}
                          brand={brand}
                          eligibleUsers={getEligibleCsUsers(brand.id)}
                          allUsers={users}
                          canEdit={canEdit}
                          onAssignMainCs={(brandId, email) =>
                            assignMainCs.mutate({ brandId, email })
                          }
                          onRemoveMainCs={(brandId, email) =>
                            removeMainCs.mutate({ brandId, email })
                          }
                          onAssignSecondaryCs={(brandId, email) =>
                            assignSecondaryCs.mutate({ brandId, email })
                          }
                          onRemoveSecondaryCs={(brandId, email) =>
                            removeSecondaryCs.mutate({ brandId, email })
                          }
                          onAssignMainEditor={(brandId, email) =>
                            assignMainEditor.mutate({ brandId, email })
                          }
                          onRemoveMainEditor={(brandId, email) =>
                            removeMainEditor.mutate({ brandId, email })
                          }
                          onAssignSecondaryEditor={(brandId, email) =>
                            assignSecondaryEditor.mutate({ brandId, email })
                          }
                          onRemoveSecondaryEditor={(brandId, email) =>
                            removeSecondaryEditor.mutate({ brandId, email })
                          }
                          isLoading={isLoading}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile stacked cards (<768px) — same data + handlers as the table */}
                <div className="md:hidden flex flex-col gap-3">
                  {filteredBrands.map((brand) => (
                    <BrandCsTable
                      key={brand.id}
                      layout="card"
                      brand={brand}
                      eligibleUsers={getEligibleCsUsers(brand.id)}
                      allUsers={users}
                      canEdit={canEdit}
                      onAssignMainCs={(brandId, email) =>
                        assignMainCs.mutate({ brandId, email })
                      }
                      onRemoveMainCs={(brandId, email) =>
                        removeMainCs.mutate({ brandId, email })
                      }
                      onAssignSecondaryCs={(brandId, email) =>
                        assignSecondaryCs.mutate({ brandId, email })
                      }
                      onRemoveSecondaryCs={(brandId, email) =>
                        removeSecondaryCs.mutate({ brandId, email })
                      }
                      onAssignMainEditor={(brandId, email) =>
                        assignMainEditor.mutate({ brandId, email })
                      }
                      onRemoveMainEditor={(brandId, email) =>
                        removeMainEditor.mutate({ brandId, email })
                      }
                      onAssignSecondaryEditor={(brandId, email) =>
                        assignSecondaryEditor.mutate({ brandId, email })
                      }
                      onRemoveSecondaryEditor={(brandId, email) =>
                        removeSecondaryEditor.mutate({ brandId, email })
                      }
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {!canEdit && brands.length > 0 && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              You have view-only access. Only Admins and Super Admins can manage CS assignments.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CsEditors;
