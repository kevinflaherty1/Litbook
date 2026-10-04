export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: FieldErrors };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });

export const fail = (error: string, fieldErrors?: FieldErrors): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
});
