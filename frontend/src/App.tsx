import { JSX, Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ComingSoonPage } from "@/components/modules/ComingSoonPage";
import { MODULES } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";

// Route-level code splitting: heavy deps (MapLibre, Recharts) load only on the
// routes that need them, keeping the initial bundle small.
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const ChangePasswordPage = lazy(() =>
  import("@/pages/ChangePasswordPage").then((m) => ({ default: m.ChangePasswordPage })),
);

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);

  useEffect(() => {
    if (isAuthenticated) void loadCurrentUser();
  }, [isAuthenticated, loadCurrentUser]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Forced password change gate (backend returns 428 on tenant endpoints).
  if (user?.must_change_password) return <Navigate to="/change-password" replace />;
  return children;
}

function RequireSession({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);

  useEffect(() => {
    if (isAuthenticated) void loadCurrentUser();
  }, [isAuthenticated, loadCurrentUser]);

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RouteFallback() {
  return (
    <div className="grid h-screen place-items-center bg-bg text-ink-faint">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/change-password"
            element={
              <RequireSession>
                <ChangePasswordPage />
              </RequireSession>
            }
          />
          {MODULES.map((m) => {
            const Element = m.element;
            const node =
              m.state === "soon" || !Element ? <ComingSoonPage module={m} /> : <Element />;
            return (
              <Route
                key={m.key}
                path={m.path}
                element={<RequireAuth>{node}</RequireAuth>}
              />
            );
          })}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
