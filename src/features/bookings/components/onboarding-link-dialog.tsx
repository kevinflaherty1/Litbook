"use client";

import { Link2 } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Shows a freshly issued onboarding link. It can't be retrieved again later. */
export function OnboardingLinkDialog({
  link,
  onOpenChange,
}: {
  link: { guestName: string; url: string; note?: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-5" /> Onboarding link for {link?.guestName}
          </DialogTitle>
          <DialogDescription>
            {link?.note && <span className="mb-2 block font-medium text-foreground">{link.note}</span>}
            Send this to your guest. They can add their bio, headshot and socials and sign your release, no
            account needed. For security, the link is shown only once. You can create a new one at any time,
            which turns this one off.
          </DialogDescription>
        </DialogHeader>
        {link && (
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 basis-56 rounded bg-muted px-2 py-1.5 text-xs break-all"
              data-testid="onboarding-url"
            >
              {link.url}
            </code>
            <CopyButton value={link.url} label="Copy link" />
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
