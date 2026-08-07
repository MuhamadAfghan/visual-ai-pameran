import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth-provider";
import { DeviceCameraProvider } from "./device-camera-provider";
import { appRouter } from "./router";
import { ErrorBoundary } from "../components/error-boundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 }
  }
});

export function AppRoot() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DeviceCameraProvider>
            <RouterProvider router={appRouter} />
          </DeviceCameraProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
