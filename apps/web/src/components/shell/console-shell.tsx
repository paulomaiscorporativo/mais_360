"use client";

import {
  Contact,
  FolderKanban,
  Building2,
  Check,
  ChevronsUpDown,
  CreditCard,
  Home,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Sun,
  Type,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo, useState, useSyncExternalStore } from "react";
import { MODULES } from "@mais/core";
import { logout } from "@/app/(auth)/actions";
import { ProductLogo, ProductMark } from "@/components/brand/logo";
import { Avatar, Kbd } from "@/components/ui";
import {
  CommandPalette,
  openCommandPalette,
  type CommandItem,
} from "@/components/ui/command-palette";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tooltip,
} from "@/components/ui/overlay";
import { MODULE_UI } from "@/config/modules-ui";
import { PRODUCT } from "@/config/product";
import { cn } from "@/lib/cn";
import type { NavData, NavTenant, NavWorkspace } from "@/server/nav";

const COLLAPSE_KEY = "mais:sidebar-collapsed";
const COLLAPSE_EVENT = "mais:sidebar-collapsed-change";

// Preferência de barra recolhida (por dispositivo), lida sem efeito/hydration mismatch.
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeCollapsed(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* armazenamento indisponível */
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

type NavItem = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

function useConsoleContext(nav: NavData) {
  // /console/<ws>/clientes/<tenant>/…  ·  /console/plataforma/…
  const segments = useSelectedLayoutSegments();
  const [first, second, third] = segments;
  const inPlatform = first === "plataforma";
  const workspace = !inPlatform && first ? nav.workspaces.find((w) => w.slug === first) : undefined;
  const tenant =
    workspace && second === "clientes" && third && third !== "novo"
      ? workspace.tenants.find((t) => t.slug === third)
      : undefined;
  return {
    inPlatform,
    workspace: workspace ?? (inPlatform ? undefined : nav.workspaces[0]),
    tenant,
  };
}

function tenantNav(ws: NavWorkspace, t: NavTenant): { main: NavItem[]; modules: NavItem[] } {
  const base = `/console/${ws.slug}/clientes/${t.slug}`;
  return {
    main: [
      { href: base, label: "Visão geral", icon: <Home />, exact: true },
      { href: `${base}/projetos`, label: "Projetos", icon: <FolderKanban /> },
      { href: `${base}/pessoas`, label: "Pessoas", icon: <Contact /> },
      { href: `${base}/modulos`, label: "Módulos", icon: <LayoutGrid /> },
      { href: `${base}/identidade`, label: "Identidade visual", icon: <Palette /> },
      { href: `${base}/termos`, label: "Nomenclatura", icon: <Type /> },
      { href: `${base}/equipe`, label: "Equipe", icon: <Users /> },
    ],
    modules: t.modules.map((m) => {
      const Icon = MODULE_UI[m].icon;
      return { href: `${base}/m/${MODULE_UI[m].slug}`, label: MODULES[m].name, icon: <Icon /> };
    }),
  };
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group text-fg-muted flex h-8 items-center gap-2.5 rounded-sm px-2 text-base transition-colors",
        "hover:bg-hover hover:text-fg [&_svg]:text-fg-subtle [&_svg]:size-4 [&_svg]:shrink-0",
        active && "bg-surface text-fg ring-border [&_svg]:text-brand-text shadow-sm ring-1",
        collapsed && "justify-center px-0",
      )}
    >
      {item.icon}
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function NavSection({
  title,
  items,
  collapsed,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {title && !collapsed && (
        <div className="text-fg-faint px-2 pt-4 pb-1 text-xs font-medium">{title}</div>
      )}
      {title && collapsed && <div className="bg-border mx-2 my-3 h-px" />}
      {items.map((it) => (
        <NavLink key={it.href} item={it} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function WorkspaceSwitcher({
  nav,
  current,
  inPlatform,
  collapsed,
}: {
  nav: NavData;
  current?: NavWorkspace;
  inPlatform: boolean;
  collapsed: boolean;
}) {
  const label = inPlatform ? "Plataforma" : (current?.name ?? "Selecione");
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          className={cn(
            "hover:bg-hover flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors",
            collapsed && "justify-center px-0",
          )}
          aria-label="Trocar de assinante"
        >
          <ProductMark className="size-7 shrink-0" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base leading-tight font-semibold">
                  {label}
                </span>
                <span className="text-fg-subtle block truncate text-xs">{PRODUCT.name}</span>
              </span>
              <ChevronsUpDown className="text-fg-faint size-4 shrink-0" />
            </>
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        {nav.user.isPlatformStaff && (
          <>
            <MenuItem asChild>
              <Link href="/console/plataforma">
                <ShieldCheck />
                <span className="flex-1">Plataforma</span>
                {inPlatform && <Check className="!text-brand-text" />}
              </Link>
            </MenuItem>
            <MenuSeparator />
          </>
        )}
        <MenuLabel>Assinantes</MenuLabel>
        {nav.workspaces.map((w) => (
          <MenuItem key={w.id} asChild>
            <Link href={`/console/${w.slug}`}>
              <Building2 />
              <span className="flex-1 truncate">{w.name}</span>
              {!inPlatform && current?.id === w.id && <Check className="!text-brand-text" />}
            </Link>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function UserMenu({ nav, collapsed }: { nav: NavData; collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const themes = [
    { value: "light", label: "Claro", icon: <Sun /> },
    { value: "dark", label: "Escuro", icon: <Moon /> },
    { value: "system", label: "Automático", icon: <Monitor /> },
  ];
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          className={cn(
            "hover:bg-hover flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors",
            collapsed && "justify-center px-0",
          )}
          aria-label="Menu da conta"
        >
          <Avatar name={nav.user.name} size="sm" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm leading-tight font-medium">
                {nav.user.name}
              </span>
              <span className="text-fg-subtle block truncate text-xs">{nav.user.email}</span>
            </span>
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="start" side="top" className="w-60">
        <MenuLabel>Aparência</MenuLabel>
        {themes.map((t) => (
          <MenuItem
            key={t.value}
            onSelect={(e) => {
              e.preventDefault();
              setTheme(t.value);
            }}
          >
            {t.icon}
            <span className="flex-1">{t.label}</span>
            {theme === t.value && <Check className="!text-brand-text" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/entrar/nova-senha">
            <KeyRound />
            Trocar senha
          </Link>
        </MenuItem>
        <MenuItem tone="danger" onSelect={() => void logout()}>
          <LogOut />
          Sair
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SidebarBody({
  nav,
  collapsed,
  onNavigate,
}: {
  nav: NavData;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { inPlatform, workspace, tenant } = useConsoleContext(nav);

  const platformItems: NavItem[] = nav.user.isPlatformStaff
    ? [
        { href: "/console/plataforma", label: "Assinantes", icon: <Building2 />, exact: true },
        { href: "/console/plataforma/planos", label: "Planos", icon: <CreditCard /> },
      ]
    : [];
  const workspaceItems: NavItem[] = workspace
    ? [{ href: `/console/${workspace.slug}`, label: "Clientes", icon: <LayoutGrid />, exact: true }]
    : [];
  const tn = workspace && tenant ? tenantNav(workspace, tenant) : null;

  return (
    <>
      <div className="px-2 pt-2">
        <WorkspaceSwitcher
          nav={nav}
          current={workspace}
          inPlatform={inPlatform}
          collapsed={collapsed}
        />
      </div>
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={() => {
            onNavigate?.();
            openCommandPalette();
          }}
          className={cn(
            "border-border bg-surface text-fg-subtle hover:border-border-strong hover:text-fg flex h-8 w-full items-center gap-2.5 rounded-sm border px-2 text-base shadow-sm transition-colors",
            collapsed && "justify-center px-0",
          )}
          aria-label="Buscar"
        >
          <Search className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <Kbd>Ctrl K</Kbd>
            </>
          )}
        </button>
      </div>
      <nav
        className="flex min-h-0 flex-1 scrollbar-thin flex-col overflow-y-auto px-2 pb-4"
        aria-label="Principal"
      >
        {tn && tenant ? (
          <>
            <Link
              href={`/console/${workspace!.slug}`}
              onClick={onNavigate}
              className={cn(
                "border-border bg-surface hover:border-border-strong mt-3 mb-1 flex items-center gap-2.5 rounded-md border p-2 shadow-sm transition-colors",
                collapsed && "justify-center border-0 bg-transparent p-0 shadow-none",
              )}
            >
              <Avatar name={tenant.name} color={tenant.color} size="sm" square />
              {!collapsed && (
                <span className="min-w-0">
                  <span className="block truncate text-sm leading-tight font-semibold">
                    {tenant.name}
                  </span>
                  <span className="text-fg-subtle block truncate text-xs">
                    Cliente · {workspace!.name}
                  </span>
                </span>
              )}
            </Link>
            <NavSection items={tn.main} collapsed={collapsed} onNavigate={onNavigate} />
            <NavSection
              title="Módulos ativos"
              items={tn.modules}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          </>
        ) : (
          <>
            <NavSection
              title={workspace ? workspace.name : undefined}
              items={workspaceItems}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
            {workspace && workspace.tenants.length > 0 && (
              <NavSection
                title="Clientes"
                collapsed={collapsed}
                onNavigate={onNavigate}
                items={workspace.tenants.slice(0, 12).map((t) => ({
                  href: `/console/${workspace.slug}/clientes/${t.slug}`,
                  label: t.name,
                  icon: <span className="size-2.5 rounded-[3px]" style={{ background: t.color }} />,
                }))}
              />
            )}
          </>
        )}
        <NavSection
          title="Plataforma"
          items={platformItems}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </nav>
      <div className="border-border border-t p-2">
        <UserMenu nav={nav} collapsed={collapsed} />
      </div>
    </>
  );
}

function buildCommands(nav: NavData): CommandItem[] {
  const items: CommandItem[] = [];
  if (nav.user.isPlatformStaff) {
    items.push(
      {
        id: "p-ws",
        group: "Plataforma",
        label: "Assinantes",
        href: "/console/plataforma",
        icon: <Building2 />,
      },
      {
        id: "p-plans",
        group: "Plataforma",
        label: "Planos",
        href: "/console/plataforma/planos",
        icon: <CreditCard />,
      },
    );
  }
  for (const w of nav.workspaces) {
    items.push({
      id: `w-${w.id}`,
      group: "Assinantes",
      label: w.name,
      hint: "Clientes",
      href: `/console/${w.slug}`,
      icon: <Building2 />,
    });
    items.push({
      id: `w-new-${w.id}`,
      group: "Ações",
      label: `Novo cliente em ${w.name}`,
      href: `/console/${w.slug}/clientes/novo`,
      icon: <LayoutGrid />,
      keywords: ["criar", "adicionar"],
    });
    for (const t of w.tenants) {
      const base = `/console/${w.slug}/clientes/${t.slug}`;
      items.push({
        id: `t-${t.id}`,
        group: "Clientes",
        label: t.name,
        hint: w.name,
        href: base,
        icon: <span className="block size-2.5 rounded-[3px]" style={{ background: t.color }} />,
      });
      for (const m of t.modules) {
        const Icon = MODULE_UI[m].icon;
        items.push({
          id: `t-${t.id}-${m}`,
          group: "Módulos",
          label: `${MODULES[m].name} — ${t.name}`,
          href: `${base}/m/${MODULE_UI[m].slug}`,
          icon: <Icon />,
        });
      }
    }
  }
  return items;
}

export function ConsoleShell({ nav, children }: { nav: NavData; children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const pathname = usePathname();
  // A gaveta fecha sozinha ao navegar: ela pertence ao caminho em que foi aberta.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const mobileOpen = drawerPath === pathname;
  const setMobileOpen = (open: boolean) => setDrawerPath(open ? pathname : null);
  const ctx = useConsoleContext(nav);
  const commands = useMemo(() => buildCommands(nav), [nav]);
  const toggle = () => writeCollapsed(!collapsed);

  const title =
    ctx.tenant?.name ?? (ctx.inPlatform ? "Plataforma" : ctx.workspace?.name) ?? PRODUCT.name;
  const home = ctx.workspace ? `/console/${ctx.workspace.slug}` : "/console";

  return (
    <div className="min-h-dvh md:flex">
      {/* Barra lateral (desktop) */}
      <aside
        className={cn(
          "border-border bg-canvas sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 ease-out md:flex",
          collapsed ? "w-[60px]" : "w-[248px]",
        )}
      >
        <SidebarBody nav={nav} collapsed={collapsed} />
        <button
          onClick={toggle}
          className="border-border-strong bg-surface text-fg-subtle hover:text-fg absolute top-[52px] -right-3 hidden size-6 place-items-center rounded-full border shadow-sm transition-colors md:grid"
          aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-3.5" />
          ) : (
            <PanelLeftClose className="size-3.5" />
          )}
        </button>
      </aside>

      {/* Cabeçalho (mobile) */}
      <header className="border-border bg-canvas/85 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-md md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-fg-muted active:bg-pressed grid size-10 place-items-center rounded-sm"
          aria-label="Abrir menu"
        >
          <MenuIcon className="size-5" />
        </button>
        <Link href={home} className="flex min-w-0 flex-1 items-center gap-2">
          {ctx.tenant ? (
            <Avatar name={ctx.tenant.name} color={ctx.tenant.color} size="xs" square />
          ) : (
            <ProductMark className="size-6" />
          )}
          <span className="text-md truncate font-semibold">{title}</span>
        </Link>
        <button
          onClick={openCommandPalette}
          className="text-fg-muted active:bg-pressed grid size-10 place-items-center rounded-sm"
          aria-label="Buscar"
        >
          <Search className="size-5" />
        </button>
      </header>

      {/* Gaveta de navegação (mobile) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div
            className="bg-overlay animate-fade-in absolute inset-0"
            onClick={() => setMobileOpen(false)}
          />
          <div className="bg-canvas shadow-sheet absolute inset-y-0 left-0 flex w-[86vw] max-w-[320px] animate-[sheet-in-left_220ms_var(--ease-out)] flex-col">
            <div className="flex items-center justify-between px-4 pt-3">
              <ProductLogo />
              <button
                onClick={() => setMobileOpen(false)}
                className="text-fg-muted grid size-10 place-items-center rounded-sm"
                aria-label="Fechar menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <SidebarBody nav={nav} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 md:px-10 md:py-10">
          {children}
        </div>
      </main>

      {/* Barra inferior (mobile) */}
      <MobileTabBar
        nav={nav}
        home={home}
        tenantBase={
          ctx.workspace && ctx.tenant
            ? `/console/${ctx.workspace.slug}/clientes/${ctx.tenant.slug}`
            : null
        }
      />
      <CommandPalette items={commands} />
    </div>
  );
}

function MobileTabBar({
  nav,
  home,
  tenantBase,
}: {
  nav: NavData;
  home: string;
  tenantBase: string | null;
}) {
  const pathname = usePathname();
  const items = tenantBase
    ? [
        { href: tenantBase, label: "Visão geral", icon: <Home />, exact: true },
        { href: `${tenantBase}/modulos`, label: "Módulos", icon: <LayoutGrid /> },
        { href: `${tenantBase}/equipe`, label: "Equipe", icon: <Users /> },
        { href: `${tenantBase}/identidade`, label: "Marca", icon: <Palette /> },
      ]
    : [
        { href: home, label: "Clientes", icon: <LayoutGrid />, exact: true },
        ...(nav.user.isPlatformStaff
          ? [
              {
                href: "/console/plataforma",
                label: "Assinantes",
                icon: <Building2 />,
                exact: true,
              },
              { href: "/console/plataforma/planos", label: "Planos", icon: <CreditCard /> },
            ]
          : []),
      ];
  return (
    <nav
      aria-label="Atalhos"
      className="safe-bottom border-border bg-canvas/90 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex max-w-md">
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-2xs text-fg-subtle flex h-16 flex-1 flex-col items-center justify-center gap-1 font-medium [&_svg]:size-5",
                active && "text-brand-text",
              )}
            >
              {it.icon}
              {it.label}
            </Link>
          );
        })}
        <button
          onClick={openCommandPalette}
          className="text-2xs text-fg-subtle flex h-16 flex-1 flex-col items-center justify-center gap-1 font-medium [&_svg]:size-5"
        >
          <Search />
          Buscar
        </button>
      </div>
    </nav>
  );
}
