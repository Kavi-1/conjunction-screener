import Link from "next/link";
import type { ReactNode } from "react";

export type SiteView = "globe" | "approaches" | "replay";

const VIEWS: Array<{ id: SiteView; href: string; label: string }> = [
  { id: "globe", href: "/", label: "Globe" },
  { id: "approaches", href: "/approaches", label: "Close approaches" },
  { id: "replay", href: "/replay", label: "2009 replay" },
];

interface SiteHeaderProps {
  current: SiteView;
  /** Optional right-hand status. The nav keeps its position whether or not it is present. */
  status?: ReactNode;
}

export function SiteHeader({ current, status }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        Conjunction Screener
      </Link>
      <nav aria-label="Views">
        <ul>
          {VIEWS.map((view) => (
            <li key={view.id}>
              <Link
                href={view.href}
                aria-current={view.id === current ? "page" : undefined}
              >
                {view.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="site-header-status">{status}</div>
    </header>
  );
}
