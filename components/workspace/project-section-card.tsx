import type { ReactNode } from "react";

type ProjectSectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function ProjectSectionCard({
  title,
  description,
  children,
}: ProjectSectionCardProps) {
  return (
    <section className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
