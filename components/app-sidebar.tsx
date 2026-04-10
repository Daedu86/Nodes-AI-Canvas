import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { SidebarProfile } from "@/components/auth/sidebar-profile"
import { ThreadList } from "./assistant-ui/thread-list"
import { ProductBrand } from "@/components/workspace/product-brand"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader className="px-4 py-4 group-data-[state=collapsed]:px-2 group-data-[state=collapsed]:py-3">
        <ProductBrand />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <ThreadList />
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-4 pt-3 group-data-[state=collapsed]:p-2 group-data-[state=collapsed]:pt-2">
        <SidebarProfile />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
