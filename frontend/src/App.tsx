import { JSX, Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ComingSoonPage } from "@/components/modules/ComingSoonPage";
import { MINUTAS_READ, MINUTAS_WRITE, MODULES } from "@/modules/registry";
import { useAuthStore } from "@/store/authStore";
import { usePendingSyncStore } from "@/store/pendingSyncStore";
import type { UserRole } from "@/types/auth";

// Route-level code splitting: heavy deps (MapLibre, Recharts) load only on the
// routes that need them, keeping the initial bundle small.
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const ChangePasswordPage = lazy(() =>
  import("@/pages/ChangePasswordPage").then((m) => ({ default: m.ChangePasswordPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
// Public, unauthenticated citizen intake form — no JWT, no AppLayout shell.
// Only reachable end-to-end when the backend flag PUBLIC_FORMS_ENABLED is on
// (see backend/app/routers/public_forms.py); otherwise the page's own fetch
// 404s and it renders a friendly "not available" state.
const PublicFormPage = lazy(() => import("@/modules/atencion/PublicFormPage"));

// Minutas & Acuerdos param routes (:id) — kept out of modules/registry.ts
// (MODULES entries double as Sidebar nav items, and a link with an unfilled
// `:id` segment would be a broken nav item). The nav-visible /minutas and
// /acuerdos list pages ARE registered in registry.ts as usual.
const MinutaEditorPage = lazy(() => import("@/modules/minutas/MinutaEditorPage"));
const MinutaDetailPage = lazy(() => import("@/modules/minutas/MinutaDetailPage"));

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

/** Role guard — must sit inside RequireAuth so user is already populated. */
function RequireRole({ roles, children }: { roles?: UserRole[]; children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  // No role restriction on this module — any authenticated user may proceed.
  if (!roles) return children;
  // User profile not yet loaded — hold until RequireAuth's effect populates it.
  if (!user) return null;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RouteFallback() {
  return (
    <div className="grid h-screen place-items-center bg-bg text-ink-faint">
      Loading…
    </div>
  );
}

/**
 * Module-level guard: ensures the `online` drain listener is attached at most
 * once for the lifetime of the page, even if this effect re-runs (React
 * StrictMode's dev double-invoke, HMR, etc.). Without it, each extra mount
 * cycle would stack another listener on `window`.
 */
let globalOnlineDrainWired = false;

/**
 * Wires the offline queue to the app's lifecycle, independent of whichever
 * page happens to be mounted — so a reconnect drains the queue even when the
 * user isn't on the legacy CapturaPage (which keeps its own page-scoped
 * drain-on-reconnect effect; both are safe to run together because
 * `drainQueue` is guarded against concurrent runs).
 *
 * Gated on `isAuthenticated`: draining while logged out would send requests
 * with no auth header, which the queue's handlers would read back as a
 * permanent 401 and mark rows "failed" for no good reason.
 */
function useGlobalOfflineSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    void usePendingSyncStore.getState().refresh();
    if (navigator.onLine) void usePendingSyncStore.getState().triggerSync();

    if (globalOnlineDrainWired) return;
    globalOnlineDrainWired = true;

    const handleOnline = () => {
      if (!useAuthStore.getState().isAuthenticated) return;
      void usePendingSyncStore.getState().triggerSync();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      globalOnlineDrainWired = false;
    };
  }, [isAuthenticated]);
}

export default function App() {
  useGlobalOfflineSync();

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Public citizen intake — outside auth, no AppLayout shell. */}
          <Route path="/p/:slug" element={<PublicFormPage />} />
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
                element={
                  <RequireAuth>
                    <RequireRole roles={m.roles}>{node}</RequireRole>
                  </RequireAuth>
                }
              />
            );
          })}
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />

          {/* Minutas & Acuerdos param routes — see MinutaEditorPage/MinutaDetailPage
              import comments above for why these live here instead of registry.ts. */}
          <Route
            path="/minutas/nueva"
            element={
              <RequireAuth>
                <RequireRole roles={MINUTAS_WRITE}>
                  <MinutaEditorPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/minutas/:id"
            element={
              <RequireAuth>
                <RequireRole roles={MINUTAS_READ}>
                  <MinutaDetailPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/minutas/:id/editar"
            element={
              <RequireAuth>
                <RequireRole roles={MINUTAS_WRITE}>
                  <MinutaEditorPage />
                </RequireRole>
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
