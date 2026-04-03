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
    <Sidebar {...props}>
      <SidebarHeader className="px-3 py-3">
        <ProductBrand />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <ThreadList />
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <SidebarProfile />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
