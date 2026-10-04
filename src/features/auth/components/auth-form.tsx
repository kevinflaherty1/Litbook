"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { signInWithEmail, signInWithOAuth, signUpWithEmail } from "@/features/auth/actions";
import { handleActionResult } from "@/lib/forms";
import { signInSchema, signUpSchema } from "@/schemas/auth";

// One form for both pages. The name field isn't rendered on sign-in, so it
// must not be validated there (it would fail invisibly).
const loginFormSchema = signInSchema.extend({ fullName: z.string().optional() });
type FormValues = z.input<typeof loginFormSchema>;

export function AuthForm({
  mode,
  next,
  googleEnabled,
}: {
  mode: "login" | "signup";
  next?: string;
  googleEnabled: boolean;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(mode === "signup" ? signUpSchema : loginFormSchema),
    defaultValues: { email: "", fullName: "", next },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result =
        mode === "signup"
          ? await signUpWithEmail({ email: values.email, fullName: values.fullName ?? "", next })
          : await signInWithEmail({ email: values.email, next });
      if (handleActionResult(form, result)) setSentTo(result.data.email);
    }),
  );

  if (sentTo) {
    return (
      <div className="grid gap-4 text-center">
        <MailCheck className="mx-auto size-10 text-muted-foreground" />
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>. It
            expires in one hour.
          </p>
        </div>
        <Button variant="ghost" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  const { errors } = form.formState;
  const otherPage = mode === "login" ? "/signup" : "/login";
  const otherHref = next ? `${otherPage}?next=${encodeURIComponent(next)}` : otherPage;

  return (
    <div className="grid gap-6">
      {googleEnabled && (
        <>
          <form action={() => signInWithOAuth({ provider: "google", next })}>
            <Button type="submit" variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
            <Separator className="flex-1" /> or <Separator className="flex-1" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {mode === "signup" && (
          <Field id="fullName" label="Your name" error={errors.fullName?.message}>
            <Input autoComplete="name" {...form.register("fullName")} />
          </Field>
        )}
        <Field id="email" label="Work email" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@yourshow.com"
            {...form.register("email")}
          />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {mode === "signup" ? "Create account" : "Email me a sign-in link"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? "New to Litbook? " : "Already have an account? "}
        <Link href={otherHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
