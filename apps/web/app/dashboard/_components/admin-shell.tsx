"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthenticatedUser, User } from "../../../../../packages/shared-types";
import FleetChatProvider, { FleetChatMenuButton } from "./fleet-chat";

type Theme = "light" | "dark";
type DemoRole = "dispatch" | "admin";
type DashboardUser = Pick<AuthenticatedUser, "user_id" | "full_name" | "role" | "company_id" | "company_name">;

export const accountRoleLabels: Record<User["role"], string> = {
  platform_admin: "Platform Admin",
  company_admin: "Company Admin",
  dispatcher: "Dispatcher",
  driver: "Driver",
};

export const demoRoleLabels: Record<DemoRole, string> = {
  dispatch: "Dispatch",
  admin: "Admin",
};
const windowRoutes = new Set<string>([
  "/dashboard/overview",
  "/dashboard/vehicles",
  "/dashboard/manage",
]);
const adminOnlyRoutes = new Set([...windowRoutes, "/dashboard/drivers"]);
const navigationItem = "flex min-h-12 min-w-[2.05rem] flex-col items-center justify-center gap-1 rounded-full px-0.5 text-[10px] font-semibold whitespace-nowrap min-[400px]:min-w-[2.8rem] min-[400px]:px-1 min-[400px]:text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm";

const navigation = [
  {
    href: "/dashboard/overview",
    label: "ภาพรวม",
    drawing: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 16v-3m4 3V8m4 8v-5" />
      </>
    ),
  },
  {
    href: "/dashboard",
    label: "แผนที่",
    drawing: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15m6-12v15" />
      </>
    ),
  },
  {
    href: "/dashboard/vehicles",
    label: "รถ",
    drawing: (
      <>
        <path d="M3 17V6h12v11m0-7h3l3 4v3h-2m-9 0h5m-10 0H3" />
        <circle cx="7.5" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </>
    ),
  },
  {
    href: "/dashboard/manage",
    label: "Manage",
    drawing: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M9 4v16m4-11h4m-4 5h4" />
      </>
    ),
  },
  {
    href: "/dashboard/drivers",
    label: "คนขับ",
    drawing: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
      </>
    ),
  },
  {
    href: "/dashboard/jobs",
    label: "งาน",
    drawing: (
      <>
        <rect x="5" y="5" width="14" height="16" rx="2" />
        <path d="M9 5V3h6v2M9 11h6m-6 4h6" />
      </>
    ),
  },
  {
    href: "/dashboard/more",
    label: "เพิ่มเติม",
    drawing: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
  },
] as const;

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});
const DashboardWindowContext = createContext({
  minimized: false,
  minimize: () => {},
  focusLauncher: () => {},
});
const DemoRoleContext = createContext<{
  role: DemoRole;
  canPreview: boolean;
  selectRole: (role: DemoRole) => void;
}>({ role: "dispatch", canPreview: false, selectRole: () => {} });
const AccountContext = createContext<DashboardUser | null>(null);

export function useAdminTheme() {
  return useContext(ThemeContext);
}

export function useDashboardWindow() {
  return useContext(DashboardWindowContext);
}

export function useDemoRole() {
  return useContext(DemoRoleContext);
}

export function useDashboardUser() {
  return useContext(AccountContext);
}

export default function AdminShell({
  children,
  map,
  user,
}: {
  children: ReactNode;
  map: ReactNode;
  user: DashboardUser;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("light");
  const [minimizedPath, setMinimizedPath] = useState<string | null>(null);
  const [previewRole, setPreviewRole] = useState<DemoRole>("admin");
  const canPreview = user.role === "company_admin";
  const roleStorageKey = `vayro-demo-role:${user.user_id}`;
  const role = canPreview ? previewRole : user.role === "platform_admin" ? "admin" : "dispatch";
  const windowLauncher = useRef<HTMLAnchorElement>(null);
  const isWindowRoute = windowRoutes.has(pathname);
  const hasMap =
    pathname === "/dashboard" || (isWindowRoute && role !== "dispatch");
  const restrictedInPreview = role !== "admin" && adminOnlyRoutes.has(pathname);
  const visibleNavigation = navigation.filter(
    ({ href }) => role === "admin" || !adminOnlyRoutes.has(href),
  );
  const minimized = minimizedPath === pathname;

  function focusLauncher() {
    windowLauncher.current?.focus({ preventScroll: true });
  }

  function minimize() {
    setMinimizedPath(pathname);
    focusLauncher();
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        if (localStorage.getItem("vayro-fleet-theme") === "dark")
          setTheme("dark");
      } catch {
        // The current tab can use the theme without browser storage.
      }
      if (!canPreview) return;
      try {
        if (sessionStorage.getItem(roleStorageKey) === "dispatch") setPreviewRole("dispatch");
      } catch {
        // Role preview still works for the current dashboard visit.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canPreview, roleStorageKey]);

  function selectRole(nextRole: DemoRole) {
    if (!canPreview) return;
    setPreviewRole(nextRole);
    try {
      sessionStorage.setItem(roleStorageKey, nextRole);
    } catch {
      // Keep the selection in memory when browser storage is unavailable.
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("vayro-fleet-theme", next);
    } catch {
      // The current tab can use the theme without browser storage.
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <AccountContext.Provider value={user}>
      <DemoRoleContext.Provider value={{ role, canPreview, selectRole }}>
        <div
          data-fleet-theme={theme}
          className="relative isolate h-dvh overflow-hidden bg-[var(--fleet-page)] font-sans text-[color:var(--fleet-text)]"
        >
          <FleetChatProvider companyId={user.company_id}>
          {hasMap && <div className="absolute inset-0 z-0">{map}</div>}
          {restrictedInPreview ? (
              <main className="mx-auto max-w-[64rem] px-4 py-8 sm:px-8 sm:py-10">
                <h1 className="text-2xl font-bold">
                  หน้านี้อยู่ในมุมมอง Admin
                </h1>
                <p className="mt-2 text-sm text-[color:var(--fleet-muted)]">
                  {canPreview ? "เลือก Admin ใน TestRole เพื่อเปิดหน้านี้" : "บัญชีนี้ไม่มีสิทธิ์เปิดหน้านี้"}
                </p>
                {canPreview && <Link
                  href="/dashboard/more#test-role"
                  className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--fleet-selected)] px-4 text-sm font-semibold text-[color:var(--fleet-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fleet-focus)]"
                >
                  ไปที่ TestRole
                </Link>}
              </main>
          ) : isWindowRoute ? (
            <DashboardWindowContext.Provider
              value={{ minimized, minimize, focusLauncher }}
            >
              <div
                hidden={minimized}
                className="pointer-events-none absolute inset-0 z-[45]"
              >
                {children}
              </div>
            </DashboardWindowContext.Provider>
          ) : (
            <div
              className={
                hasMap
                  ? ""
                  : "h-full overflow-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
              }
            >
              {children}
            </div>
          )}
          <nav
            aria-label="เมนู Workspace"
            className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full border border-[var(--fleet-line)] bg-[var(--fleet-surface)] p-1.5 shadow-[var(--fleet-shadow-panel)]"
          >
            <ul className="grid auto-cols-fr grid-flow-col gap-0.5 sm:gap-1.5">
              {visibleNavigation.map(({ href, label, drawing }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      ref={active && isWindowRoute ? windowLauncher : undefined}
                      onClick={(event) => {
                        if (
                          !event.metaKey &&
                          !event.ctrlKey &&
                          !event.shiftKey &&
                          !event.altKey
                        )
                          setMinimizedPath(null);
                      }}
                      aria-current={active ? "page" : undefined}
                      className={`${navigationItem} ${active ? "soft-inset bg-[var(--fleet-selected)] text-[color:var(--fleet-accent)]" : "text-[color:var(--fleet-muted)] hover:bg-[var(--fleet-quiet)]"}`}
                    >
                      <svg
                        aria-hidden="true"
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.65"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {drawing}
                      </svg>
                      {label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <FleetChatMenuButton className={`${navigationItem} w-full cursor-pointer text-[color:var(--fleet-muted)] hover:bg-[var(--fleet-quiet)]`} />
              </li>
            </ul>
          </nav>
          </FleetChatProvider>
        </div>
      </DemoRoleContext.Provider>
      </AccountContext.Provider>
    </ThemeContext.Provider>
  );
}
