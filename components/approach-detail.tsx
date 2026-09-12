import type { ReactNode } from "react";

interface ApproachDetailProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function ApproachDetail({ title, description, children }: ApproachDetailProps) {
  return (
    <section className="approach-detail" aria-label={`${title} details`}>
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}
