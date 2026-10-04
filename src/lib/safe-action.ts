import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";

import { fail, type ActionResult, type FieldErrors } from "@/lib/action-result";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type OrgRole = Database["public"]["Enums"]["org_role"];
type ServerClient = Awaited<ReturnType<typeof createClient>>;

type AuthedContext = { supabase: ServerClient; user: CurrentUser };
type OrgContext = AuthedContext & { org: { id: string; slug: string }; role: OrgRole };

/**
 * Wraps a server action in the standard pipeline:
 *   1. require a signed-in user
 *   2. validate input with Zod
 *   3. run the handler, converting unexpected errors into a generic failure
 * redirect()/notFound() thrown by the handler propagate normally.
 */
export function authedAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>, ctx: AuthedContext) => Promise<ActionResult<T>>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await getCurrentUser();
      if (!user) return fail("Your session has expired. Please sign in again.");

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
      }

      const supabase = await createClient();
      return await handler(parsed.data, { supabase, user });
    } catch (error) {
      unstable_rethrow(error);
      console.error("[action] unexpected error", error);
      return fail("Something went wrong. Please try again.");
    }
  };
}

/**
 * For public actions (the guest portal), where the caller proves access some
 * other way, such as an onboarding token checked by the handler.
 */
export function publicAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>) => Promise<ActionResult<T>>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
      }
      return await handler(parsed.data);
    } catch (error) {
      unstable_rethrow(error);
      console.error("[action] unexpected error", error);
      return fail("Something went wrong. Please try again.");
    }
  };
}

/**
 * Like authedAction, for actions scoped to one organization. The input must
 * include `orgId`; membership (and optionally role) is verified server-side
 * before the handler runs. RLS enforces the same rules again in the database.
 */
export function orgAction<S extends z.ZodType<{ orgId: string }>, T>(
  schema: S,
  options: { roles?: OrgRole[] },
  handler: (input: z.output<S>, ctx: OrgContext) => Promise<ActionResult<T>>,
) {
  return authedAction(schema, async (input, ctx) => {
    const { data: membership } = await ctx.supabase
      .from("organization_members")
      .select("role, organizations!inner(id, slug)")
      .eq("organization_id", input.orgId)
      .eq("user_id", ctx.user.id)
      .maybeSingle();

    if (!membership) return fail("You don't have access to this organization.");
    if (options.roles && !options.roles.includes(membership.role)) {
      return fail("You don't have permission to do that.");
    }

    return handler(input, {
      ...ctx,
      org: { id: membership.organizations.id, slug: membership.organizations.slug },
      role: membership.role,
    });
  });
}

export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
