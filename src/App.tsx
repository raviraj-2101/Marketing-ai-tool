import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdsLauncherLayout from "@/components/AdsLauncherLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Brands from "./pages/Brands";
import Publishers from "./pages/Publishers";
import Inspo from "./pages/Inspo";
import Themes from "./pages/Themes";
import StaticsGenerator from "./pages/StaticsGenerator";
import ConfigModule from "./pages/ConfigModule";
import AdGeneratorPage from "./pages/AdGeneratorPage";
import PipelineLogPage from "./pages/PipelineLogPage";
import UGCGenerator from "./pages/UGCGenerator";
import FormTemplates from "./pages/FormTemplates";
import NotFound from "./pages/NotFound";
import UserManagement from "./pages/UserManagement";
import CsEditors from "./pages/CsEditors";
import TSLGenerator from "./pages/TSLGenerator";
import AvatarGeneration from "./pages/AvatarGeneration";
import ManageScenes from "./pages/ManageScenes";
import CreateVideos from "./pages/CreateVideos";
import AvatarConfiguration from "./pages/AvatarConfiguration";
import AvatarConfigurationDetail from "./pages/AvatarConfigurationDetail";
import AdsDb from "./pages/AdsDb";
import FieldsConfig from "./pages/FieldsConfig";
import ScriptsManagement from "./pages/ScriptsManagement";
import TslScripts from "./pages/TslScripts";
import AdsPerformance from "./pages/AdsPerformance";
import BonusesPage from "./pages/BonusesPage";
import AdBankPage from "./pages/AdBankPage";
import PipelineReport from "./pages/PipelineReport";
import EditorsPace from "./pages/EditorsPace";
import CSsPace from "./pages/CSsPace";
import CsKpisPage from "./pages/CsKpisPage";
import SpyToolPage from "./pages/SpyToolPage";
import ScriptChat from "./pages/ScriptChat";
import PixarBuilder from "./pages/PixarBuilder";
import NewPixarBuilder from "./pages/NewPixarBuilder";
import BatchCreator from "./pages/BatchCreator";
import BuildDetail from "./pages/BuildDetail";
import UgcAvatarConfig from "./pages/UgcAvatarConfig";
import UgcBuildLog from "./pages/UgcBuildLog";
import UgcAutomations from "./pages/UgcAutomations";
import UgcAutomationRunDetail from "./pages/UgcAutomationRunDetail";
import AdsLauncherLaunch from "./pages/AdsLauncherLaunchPage";
import AdsLauncherLog from "./pages/AdsLauncherLogPage";
import AdsLauncherAccounts from "./pages/AdsLauncherAccountsPage";
import AdsLauncherLibrary from "./pages/AdsLauncherLibraryPage";
import AdsLauncherSettings from "./pages/AdsLauncherSettingsPage";
import AdsLauncherBrands from "./pages/AdsLauncherBrandsPage";
import AdsLauncherProducts from "./pages/AdsLauncherProductsPage";
import AdsLauncherBrandsProducts from "./pages/AdsLauncherBrandsProductsPage";
import AdsLauncherProductEdit from "./pages/AdsLauncherProductEditPage";
import AdsLauncherDestinations from "./pages/AdsLauncherDestinationsPage";
import UgcAvatarsPage from "./pages/UgcAvatarsPage";
import TslChatPage from "./pages/TslChatPage";
import TslScriptBankPage from "./pages/TslScriptBankPage";
import TslDevelopPage from "./pages/TslDevelopPage";
import TslMetadataPage from "./pages/TslMetadataPage";
import TslLogPage from "./pages/TslLogPage";
import TslSettingsPage from "./pages/TslSettingsPage";
import UgcVideoBuiltLog from "./pages/UgcVideoBuiltLog";
import PrivacyPolicy from "./pages/PrivacyPolicy";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/dashboard" element={<ProtectedRoute blockForCustomOnly><Dashboard /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute blockForCustomOnly><UserManagement /></ProtectedRoute>} />
            <Route path="/cs-editors" element={<ProtectedRoute blockForCustomOnly><CsEditors /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
            <Route path="/brands" element={<ProtectedRoute><Brands /></ProtectedRoute>} />
            <Route path="/publishers" element={<ProtectedRoute><Publishers /></ProtectedRoute>} />
            <Route path="/inspo" element={<ProtectedRoute><Inspo /></ProtectedRoute>} />
            <Route path="/themes" element={<ProtectedRoute><Themes /></ProtectedRoute>} />
            <Route path="/statics-generator" element={<ProtectedRoute><StaticsGenerator /></ProtectedRoute>} />
            <Route path="/config-module" element={<ProtectedRoute><ConfigModule /></ProtectedRoute>} />
            <Route path="/ad-generator" element={<ProtectedRoute><AdGeneratorPage /></ProtectedRoute>} />
            <Route path="/pipeline-log" element={<ProtectedRoute><PipelineLogPage /></ProtectedRoute>} />
            <Route path="/ugc-generator" element={<ProtectedRoute><UGCGenerator /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><FormTemplates /></ProtectedRoute>} />
            <Route path="/tsl-generator" element={<ProtectedRoute><TSLGenerator /></ProtectedRoute>} />
            <Route path="/video-builder/avatar-generation" element={<ProtectedRoute><AvatarGeneration /></ProtectedRoute>} />
            <Route path="/video-builder/avatar-configuration" element={<ProtectedRoute><AvatarConfiguration /></ProtectedRoute>} />
            <Route path="/video-builder/avatar-configuration/:avatarId" element={<ProtectedRoute><AvatarConfigurationDetail /></ProtectedRoute>} />
            <Route path="/video-builder/manage-scenes" element={<ProtectedRoute><ManageScenes /></ProtectedRoute>} />
            <Route path="/video-builder/manage-scenes/:avatarId" element={<ProtectedRoute><ManageScenes /></ProtectedRoute>} />
            <Route path="/video-builder/create-videos" element={<ProtectedRoute><CreateVideos /></ProtectedRoute>} />
             <Route path="/ads-management/ads-db" element={<ProtectedRoute><AdsDb /></ProtectedRoute>} />
            <Route path="/ads-management/fields-config" element={<ProtectedRoute devOnly><FieldsConfig /></ProtectedRoute>} />
            <Route path="/ads-management/scripts" element={<ProtectedRoute><ScriptsManagement /></ProtectedRoute>} />
            <Route path="/ads-management/tsl-scripts" element={<ProtectedRoute><TslScripts /></ProtectedRoute>} />
            <Route path="/ads-performance" element={<ProtectedRoute><AdsPerformance /></ProtectedRoute>} />
            <Route path="/bonuses" element={<ProtectedRoute bonusesOnly><BonusesPage /></ProtectedRoute>} />
            <Route path="/ad-bank" element={<ProtectedRoute><AdBankPage /></ProtectedRoute>} />
            <Route path="/pipeline-report" element={<ProtectedRoute><PipelineReport /></ProtectedRoute>} />
            <Route path="/editors-pace" element={<ProtectedRoute><EditorsPace /></ProtectedRoute>} />
            <Route path="/cs-pace" element={<ProtectedRoute><CSsPace /></ProtectedRoute>} />
            <Route path="/cs-kpis" element={<ProtectedRoute><CsKpisPage /></ProtectedRoute>} />
            <Route path="/spy-tool" element={<ProtectedRoute><SpyToolPage /></ProtectedRoute>} />
            <Route path="/ugc-scripts/chat" element={<ProtectedRoute><ScriptChat /></ProtectedRoute>} />
            <Route path="/ugc-builder/generate-scripts" element={<ProtectedRoute><ScriptChat /></ProtectedRoute>} />
            <Route path="/ugc-builder/batch-creator" element={<ProtectedRoute><BatchCreator /></ProtectedRoute>} />
            <Route path="/pixar-builder" element={<ProtectedRoute><PixarBuilder /></ProtectedRoute>} />
            <Route path="/new-pixar-builder" element={<ProtectedRoute><NewPixarBuilder /></ProtectedRoute>} />
            <Route path="/ugc-builder/builds/:buildId" element={<ProtectedRoute><BuildDetail /></ProtectedRoute>} />
            {/* <Route path="/ugc-builder/avatar-config" element={<ProtectedRoute><UgcAvatarConfig /></ProtectedRoute>} /> */}
            <Route path="/ugc-builder/log" element={<ProtectedRoute><UgcBuildLog /></ProtectedRoute>} />
            <Route path="/ugc-builder/automations" element={<ProtectedRoute><UgcAutomations /></ProtectedRoute>} />
            <Route path="/ugc-builder/automations/runs/:runId" element={<ProtectedRoute><UgcAutomationRunDetail /></ProtectedRoute>} />
            <Route path="/ugc-builder/video-build-log" element={<ProtectedRoute><UgcVideoBuiltLog /></ProtectedRoute>} />
            <Route element={<ProtectedRoute><AdsLauncherLayout /></ProtectedRoute>}>
              <Route path="/ads-launcher/launch" element={<AdsLauncherLaunch />} />
              <Route path="/ads-launcher/log" element={<AdsLauncherLog />} />
              <Route path="/ads-launcher/log/:id" element={<AdsLauncherLog />} />
              <Route path="/ads-launcher/accounts" element={<AdsLauncherAccounts />} />
              <Route path="/ads-launcher/library" element={<AdsLauncherLibrary />} />
              <Route path="/ads-launcher/brands-products" element={<AdsLauncherBrandsProducts />} />
              <Route path="/ads-launcher/brands" element={<AdsLauncherBrands />} />
              <Route path="/ads-launcher/products" element={<AdsLauncherProducts />} />
              <Route path="/ads-launcher/products/:id" element={<AdsLauncherProductEdit />} />
              <Route path="/ads-launcher/destinations" element={<AdsLauncherDestinations />} />
              <Route path="/ads-launcher/settings" element={<AdsLauncherSettings />} />
            </Route>
            <Route path="/ugc-builder/avatars" element={<ProtectedRoute><UgcAvatarsPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/generate-scripts/:chatId?" element={<ProtectedRoute tslOnly><TslChatPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/develop/:chatId?" element={<ProtectedRoute tslOnly><TslDevelopPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/develop/metadata" element={<ProtectedRoute tslOnly><TslMetadataPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/develop/:chatId/metadata" element={<ProtectedRoute tslOnly><TslMetadataPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/tsl-log" element={<ProtectedRoute tslOnly><TslLogPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/tsl-log/:buildId" element={<ProtectedRoute tslOnly><TslLogPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/settings" element={<ProtectedRoute tslOnly><TslSettingsPage /></ProtectedRoute>} />
            <Route path="/tsl-builder/script-bank" element={<ProtectedRoute tslOnly><TslScriptBankPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
