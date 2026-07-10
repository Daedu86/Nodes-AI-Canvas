import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { SidebarProfile } from "@/components/auth/sidebar-profile"
import { ThreadList } from "./assistant-ui/thread-list"
import { ProductBrand } from "@/components/workspace/product-brand"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader className="px-4 py-4 group-data-[state=collapsed]:px-1.5 group-data-[state=collapsed]:py-3">
        <ProductBrand compact={isCollapsed} />
      </SidebarHeader>
      <SidebarSeparator
        aria-hidden={isCollapsed || undefined}
        className={isCollapsed ? "invisible" : undefined}
      />
      <SidebarContent
        aria-hidden={isCollapsed || undefined}
        className="transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:invisible group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0"
      >
        <ThreadList />
      </SidebarContent>
      <SidebarSeparator
        aria-hidden={isCollapsed || undefined}
        className={isCollapsed ? "invisible" : undefined}
      />
      <SidebarFooter className="p-4 pt-3 group-data-[state=collapsed]:p-1">
        <SidebarProfile />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
