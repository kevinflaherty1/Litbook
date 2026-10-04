import { Logo } from "@/components/shared/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <Logo />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
