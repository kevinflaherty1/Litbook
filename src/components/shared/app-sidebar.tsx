"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Contact, CreditCard, LayoutDashboard, Mic, Settings, Users } from "lucide-react";

import { cn } from "@/lib/utils";

export function AppSidebarNav({ orgSlug, showBilling }: { orgSlug: string; showBilling: boolean }) {
  const pathname = usePathname();
  const base = `/${orgSlug}`;
  const items = [
    { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
    { href: `${base}/episodes`, label: "Episodes", icon: Mic, exact: false },
    { href: `${base}/guests`, label: "Guests", icon: Contact, exact: false },
    { href: `${base}/settings/team`, label: "Team", icon: Users, exact: false },
    { href: `${base}/settings`, label: "Settings", icon: Settings, exact: true },
    ...(showBilling
      ? [{ href: `${base}/settings/billing`, label: "Billing", icon: CreditCard, exact: false }]
      : []),
  ];

  return (
    <nav className="grid gap-1">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
