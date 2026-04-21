"use client";

import React from "react";
import { usePathname, useSearchParams } from "next/navigation";

const APP_TITLE = "Nodes";

export function AppTitleSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  React.useEffect(() => {
    if (document.title !== APP_TITLE) {
      document.title = APP_TITLE;
    }
  }, [pathname, search]);

  return null;
}
