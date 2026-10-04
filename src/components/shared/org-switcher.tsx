"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Org = { id: string; name: string; slug: string };

export function OrgSwitcher({ current, orgs }: { current: Org; orgs: Org[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3">
          <span className="truncate">{current.name}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem key={org.id} asChild>
            <Link href={`/${org.slug}`}>
              <span className="flex-1 truncate">{org.name}</span>
              {org.id === current.id && <Check />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus /> Create workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
