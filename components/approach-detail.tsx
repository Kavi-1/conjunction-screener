import type { ReactNode } from "react";

interface ApproachDetailProps {
  /** Names the region for assistive technology; the panel's own content is the heading. */
  label: string;
  children: ReactNode;
}

export function ApproachDetail({ label, children }: ApproachDetailProps) {
  return (
    <section className="approach-detail" aria-label={label}>
      {children}
    </section>
  );
}
