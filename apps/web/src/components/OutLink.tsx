// apps/web/src/components/OutLink.tsx - External destinations carry the outbound arrow; web pages open in a new tab, while protocol links open their handler.


/** A link that leaves neon1, with a new tab only for web pages and the northeast arrow */
export function OutLink({ href, title, className, children }: { href: string; title?: string; className?: string; children: React.ReactNode }) {
  const opensApp = /^(mailto|tel):/i.test(href);
  return <a className={`out${className ? ` ${className}` : ""}`} href={href} title={title} {...(opensApp ? {} : { target: "_blank", rel: "noopener noreferrer" })}>{children}<span className="out-arrow" aria-hidden="true" /></a>;
}
