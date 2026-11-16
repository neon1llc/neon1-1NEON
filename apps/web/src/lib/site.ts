// apps/web/src/lib/site.ts - Links from 1NEON to the rest of neon1.tech, kept to the environment they are read in. The
// site and 1NEON share one origin (neon1.tech in production, dev.neon1.tech on dev), so a link to the site is a plain
// path ("/report-bug/"), never the production address; the same path then lands on dev from dev and on production from
// production. Text written elsewhere (the policies, copied from the corpus) names the production address in full, and
// is rewritten to its path where it is drawn. site.test.ts fails the build on a new hardcoded production address.


const PRODUCTION = /^https?:\/\/(www\.)?neon1\.tech(?=[/?#]|$)/;


/** An address on this site written in full becomes its path, so it opens in the environment it is read in; anything else is unchanged */
export const ownSite = (href: string) => (PRODUCTION.test(href) ? href.replace(PRODUCTION, "") || "/" : href);
