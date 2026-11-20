// apps/web/src/lib/plural.ts - "1 project", "2 projects": a count with its noun, singular at exactly one.


/** The noun in the form a count takes: "project" for 1, "projects" otherwise (give `many` when it isn't just an s) */
export const noun = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);


/** The count with its noun: "1 project", "0 projects" */
export const plural = (n: number, one: string, many?: string): string => `${n} ${noun(n, one, many)}`;
