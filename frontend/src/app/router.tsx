import { Navigate, createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "./protected-route";
import { RoleAppLayout } from "../layouts/role-app-layout";
import { GuestLayout } from "../layouts/guest-layout";
import { CameraWallPage } from "../pages/guest/camera-wall.page";
import { EventFeedPage } from "../pages/guest/event-feed.page";
import { MapViewPage } from "../pages/guest/map-view.page";
import { CameraViewPage } from "../pages/guest/camera-view.page";
import { LoginPage } from "../features/auth/login.page";
import { ForgotPasswordPage } from "../features/auth/forgot-password.page";
import { ResetPasswordPage } from "../features/auth/reset-password.page";
import { ProfilePage } from "../features/auth/profile.page";
import { DashboardRouter } from "./dashboard-router";
import { CameraDetailPage } from "../features/cameras/camera-detail.page";
import { EventsPage } from "../features/events/events.page";
import { AreasPage } from "../features/areas/areas.page";
import { CamerasPage } from "../features/cameras/cameras.page";
import { CameraNewPage } from "../features/cameras/camera-new.page";
import { CameraEditPage } from "../features/cameras/camera-edit.page";
import { SectionMapPage } from "../features/cameras/section-map.page";
import { ModelsPage } from "../features/ai-models/models.page";
import { MappingsPage } from "../features/mappings/mappings.page";
import { CameraMappingsPage } from "../features/mappings/camera-mappings.page";
import { MappingFormPage } from "../features/mappings/mapping-form.page";
import { PicsPage } from "../features/pics/pics.page";
import { PicNewPage } from "../features/pics/pic-new.page";
import { PicEditPage } from "../features/pics/pic-edit.page";
import { ReportsPage } from "../features/reports/reports.page";
import { UsersPage } from "../features/users/users.page";
import { UserNewPage } from "../features/users/user-new.page";
import { UserEditPage } from "../features/users/user-edit.page";
import { SettingsPage } from "../features/settings/settings.page";
import { AuditLogsPage } from "../features/audit/audit-logs.page";
import { DetectionJobsPage } from "../features/jobs/detection-jobs.page";
import { RolesPage } from "../features/roles/roles.page";
import { SystemHealthPage } from "../features/system-health/system-health.page";

export const appRouter = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/system-health", element: <SystemHealthPage /> },
  {
    element: <ProtectedRoute allowedRoles={["super_admin", "admin", "viewer", "pic"]} />,
    children: [
      {
        element: <RoleAppLayout />,
        children: [
          { path: "/dashboard", element: <DashboardRouter /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/cameras/:id/detail", element: <CameraDetailPage /> },
          { path: "/events", element: <EventsPage /> },
          { path: "/areas", element: <AreasPage /> },
          { path: "/cameras", element: <CamerasPage /> },
          { path: "/cameras/map", element: <SectionMapPage /> },
          { path: "/cameras/new", element: <CameraNewPage /> },
          { path: "/cameras/:id/edit", element: <CameraEditPage /> },
          { path: "/cameras/:id/mappings", element: <CameraMappingsPage /> },
          { path: "/cameras/:id/mappings/new", element: <MappingFormPage mode="new" /> },
          { path: "/cameras/:id/mappings/:mappingId/edit", element: <MappingFormPage mode="edit" /> },
          { path: "/reports", element: <ReportsPage /> },
          {
            element: <ProtectedRoute allowedRoles={["admin", "super_admin"]} />,
            children: [
              { path: "/models", element: <ModelsPage /> },
              { path: "/schedules", element: <MappingsPage /> },
              { path: "/sequences", element: <Navigate to="/schedules" replace /> },
              { path: "/pics", element: <PicsPage /> },
              { path: "/pics/new", element: <PicNewPage /> },
              { path: "/pics/:id/edit", element: <PicEditPage /> }
            ]
          },
          {
            element: <ProtectedRoute allowedRoles={["super_admin"]} />,
            children: [
              { path: "/users", element: <UsersPage /> },
              { path: "/users/new", element: <UserNewPage /> },
              { path: "/users/:id/edit", element: <UserEditPage /> },
              { path: "/roles", element: <RolesPage /> },
              { path: "/settings", element: <SettingsPage /> },
              { path: "/audit-logs", element: <AuditLogsPage /> },
              { path: "/detection-jobs", element: <DetectionJobsPage /> }
            ]
          }
        ]
      }
    ]
  },
  {
    element: <ProtectedRoute allowedRoles={["super_admin", "admin", "viewer", "pic"]} />,
    children: [
      {
        element: <GuestLayout />,
        children: [
          { path: "/guest", element: <Navigate to="/guest/cameras" replace /> },
          { path: "/guest/cameras", element: <CameraWallPage /> },
          { path: "/guest/cameras/:id", element: <CameraViewPage /> },
          { path: "/guest/events", element: <EventFeedPage /> },
          { path: "/guest/map", element: <MapViewPage /> },
          { path: "/guest/areas", element: <Navigate to="/guest/map" replace /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> }
]);
