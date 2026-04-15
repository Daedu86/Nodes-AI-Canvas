"use client";

import type { FC } from "react";
import React from "react";
import type { ImageMessagePartProps } from "@assistant-ui/react";
import { cn } from "@/lib/utils";

export const ChatImagePart: FC<ImageMessagePartProps> = ({ image, filename, status }) => {
  void status;
  const alt = filename?.trim().length ? filename : "Image";

  return (
    <figure className="my-3 overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={alt}
        className={cn(
          "block max-h-[420px] w-auto max-w-full object-contain",
          "bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.18),transparent_45%)]",
        )}
      />
      {filename?.trim().length ? (
        <figcaption className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground">
          {filename}
        </figcaption>
      ) : null}
    </figure>
  );
};

