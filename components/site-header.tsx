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
      <div className="site-header-end">
        <div className="site-header-status">{status}</div>
        <a
          className="github-link"
          href="https://github.com/Kavi-1/conjunction-screener"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="View Conjunction Screener on GitHub"
          title="View source on GitHub"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.3 4 5 5 0 0 0 19.1.5S17.9.1 15 2a13.4 13.4 0 0 0-7 0C5.1.1 3.9.5 3.9.5A5 5 0 0 0 3.7 4a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 8 18v4m0-3c-3 .9-3-1.5-4.2-2" />
          </svg>
        </a>
      </div>
    </header>
  );
}
