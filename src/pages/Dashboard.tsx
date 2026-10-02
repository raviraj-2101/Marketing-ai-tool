import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Bookmark, Users, Lightbulb, TrendingUp, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";

const stats = [
  { label: "Total Products", value: "1,284", icon: Package, change: "+12%" },
  { label: "Active Brands", value: "48", icon: Bookmark, change: "+3%" },
  { label: "Publishers", value: "156", icon: Users, change: "+8%" },
  { label: "Inspo Items", value: "892", icon: Lightbulb, change: "+24%" },
];

const quickLinks = [
  { title: "Products", description: "Manage product catalog", icon: Package, url: "/products", color: "bg-blue-500" },
  { title: "Brands", description: "Brand management", icon: Bookmark, url: "/brands", color: "bg-purple-500" },
  { title: "Publishers", description: "Publisher network", icon: Users, url: "/publishers", color: "bg-green-500" },
  { title: "Inspo", description: "Inspiration library", icon: Lightbulb, url: "/inspo", color: "bg-amber-500" },
];

const Dashboard = () => {
  return (
    <DashboardLayout>
      <div className="page-container h-full overflow-auto">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">Welcome to Acentecom AI Statics Generator</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                  </div>
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3">
                  <TrendingUp className="w-3 h-3 text-green-500" />
                  <span className="text-xs text-green-500 font-medium">{stat.change}</span>
                  <span className="text-xs text-muted-foreground">vs last month</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Access */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickLinks.map((link) => (
              <Link key={link.title} to={link.url}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className={`w-10 h-10 ${link.color} rounded-lg flex items-center justify-center mb-4`}>
                      <link.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-medium text-foreground">{link.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Recent Activity</CardTitle>
            </div>
            <CardDescription>Latest updates across all modules</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { action: "New product added", module: "Products", time: "2 min ago" },
                { action: "Brand updated", module: "Brands", time: "15 min ago" },
                { action: "Publisher onboarded", module: "Publishers", time: "1 hour ago" },
                { action: "Inspo collection created", module: "Inspo", time: "3 hours ago" },
              ].map((activity, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">{activity.module}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
