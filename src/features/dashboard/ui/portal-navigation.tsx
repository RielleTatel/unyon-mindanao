"use client";

import {
  Bell,
  Building2,
  CalendarDays,
  CakeSlice,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Link2,
  ScrollText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/portal", label: "Home", icon: LayoutDashboard },
  { href: "/portal/events", label: "Events", icon: CalendarDays },
  { href: "/portal/announcements", label: "Announcements", icon: Bell },
  { href: "/portal/birthdays", label: "Birthdays", icon: CakeSlice },
  { href: "/portal/evaluations", label: "Evaluations", icon: ClipboardCheck },
  { href: "/portal/financial-reports", label: "Reports", icon: FileText },
  { href: "/portal/shortcuts", label: "Shortcuts", icon: Link2 },
  { href: "/portal/profile", label: "Profile", icon: UserRound },
] as const;

const adminNavigation = [
  { href: "/portal/team", label: "Team", icon: UsersRound, access: "university" },
  { href: "/portal/universities", label: "Directory", icon: Building2, access: "super" },
  { href: "/portal/accounts", label: "Accounts", icon: ShieldCheck, access: "super" },
  { href: "/portal/audit", label: "Audit", icon: ScrollText, access: "super" },
] as const;

export function PortalNavigation({
  isSuperAdmin,
  isUniversityAdmin,
}: {
  isSuperAdmin: boolean;
  isUniversityAdmin: boolean;
}) {
  const pathname = usePathname();
  const items = [
    ...navigation,
    ...adminNavigation.filter(({ access }) =>
      access === "super" ? isSuperAdmin : isSuperAdmin || isUniversityAdmin,
    ),
  ];

  return (
    <nav aria-label="Portal navigation" className="portal-nav">
      {items.map(({ href, icon: Icon, label }) => {
        const active = href === "/portal" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className="portal-nav__link"
            data-active={active || undefined}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
