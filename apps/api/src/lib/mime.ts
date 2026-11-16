// apps/api/src/lib/mime.ts - A raw email message: plain text and HTML alternatives, with images that the HTML shows
// inline (cid:) and that also arrive as attachments. SES's simple format can't carry attachments, so a message
// with images is sent as this raw text. Everything is base64 with short lines, so no body can break a header or boundary.

/** A file travelling with an email; `cid` lets the HTML show it inline */
export interface Attachment {
  name: string;
  type: string;
  bytes: Uint8Array;
  cid?: string;
}

// Base64 of bytes or text, folded at 76 characters as mail requires
function b64(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

/** A header value with non-ASCII text encoded as RFC 2047 words */
export function headerText(s: string): string {
  const clean = s.replace(/[\r\n]+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${b64(clean).replace(/\r\n/g, "")}?=`;
}

// A filename safe inside a quoted header parameter
const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";

// A boundary no body can contain, since every body is base64
const boundary = (tag: string) => `=_${tag}_${[...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

/** The message as raw RFC 5322 text, CRLF line ends */
export function rawMessage(m: { from: string; to: string; subject: string; replyTo?: string; text: string; html: string; attachments: Attachment[] }): string {
  const mixed = boundary("mixed"), alt = boundary("alt"), rel = boundary("rel");
  const inline = m.attachments.filter((a) => a.cid);
  const parts: string[] = [];
  const head = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    ...(m.replyTo ? [`Reply-To: ${m.replyTo.replace(/[\r\n<>,;]/g, "")}`] : []),
    `Subject: ${headerText(m.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ];
  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.text)].join("\r\n");
  const htmlPart = ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.html)].join("\r\n");
  const file = (a: Attachment, disposition: "inline" | "attachment") => [
    `Content-Type: ${a.type}; name="${safeName(a.name)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: ${disposition}; filename="${safeName(a.name)}"`,
    ...(a.cid ? [`Content-ID: <${a.cid}>`] : []),
    "",
    b64(a.bytes),
  ].join("\r\n");

  // The HTML with its inline images, as one related group inside the alternatives
  const htmlGroup = inline.length
    ? [`Content-Type: multipart/related; boundary="${rel}"`, "", `--${rel}`, htmlPart, ...inline.flatMap((a) => [`--${rel}`, file(a, "inline")]), `--${rel}--`].join("\r\n")
    : htmlPart;
  parts.push([`Content-Type: multipart/alternative; boundary="${alt}"`, "", `--${alt}`, textPart, `--${alt}`, htmlGroup, `--${alt}--`].join("\r\n"));
  // Images without an inline place travel as plain attachments
  for (const a of m.attachments.filter((x) => !x.cid)) parts.push(file(a, "attachment"));
  return `${head.join("\r\n")}\r\n\r\n${parts.map((p) => `--${mixed}\r\n${p}`).join("\r\n")}\r\n--${mixed}--\r\n`;
}
