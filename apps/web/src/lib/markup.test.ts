// apps/web/src/lib/markup.test.ts - An edited proposal copy: its changes are found paragraph by
// paragraph, traced to the option fields they came from, and anything else is left for neon1.


import { ProposalSnapshot } from "@1neon/domain";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { blockParagraphs, docxParagraphs, proposalBlocks } from "./docx.ts";
import { compare, replaceInBody, suggest, words, type Printed } from "./markup.ts";


const printed: Printed[] = [
  { text: "Neon1: Chatbot" },
  { text: " OPTIONS " },
  { text: "0039-r1-A  AWS tooling  (recommended)", opt: "0039-r1-A", field: "title" },
  { text: "Centralize site in AWS with chatbot", opt: "0039-r1-A", field: "body" },
  { text: "neon1's time: 10 to 20 hours · Timeline: 2 weeks · Price: $1,000 to $2,000 estimate", opt: "0039-r1-A", field: "meta" },
  { text: "When you pay: $500.00 when you approve (50% of the low end, as a deposit); The rest when you accept the handover: the hours worked, less the deposit.", opt: "0039-r1-A", field: "pay" },
  { text: "Neither of us adds work or cost without a written change, which becomes the next revision." },
];
const option = { code: "0039-r1-A", title: "AWS tooling", body: "Centralize site in AWS with chatbot", fields: { pricing: "estimate", recommended: true } };

describe("an edited proposal", () => {
  it("finds a changed deposit and suggests the option's deposit share", () => {
    const edited = printed.map((p) => p.text.replace("$500.00 when you approve (50% of the low end", "$200.00 when you approve (20% of the low end").replace("’", "'"));
    const changes = compare(printed, edited);
    expect(changes).toEqual([expect.objectContaining({ kind: "changed", field: "pay", opt: "0039-r1-A" })]);
    const { updates, manual } = suggest(changes, [option]);
    expect(manual).toEqual([]);
    expect(updates[0]!.fields).toEqual({ depositPercent: 20 });
  });

  it("traces the timeline, the title, and a new sentence; leaves the price of an estimate for neon1", () => {
    const edited = [printed[0]!.text, printed[1]!.text, "0039-r1-A AWS tooling and chat", printed[3]!.text, "It answers in English and Spanish.", "neon1’s time: 10 to 20 hours · Timeline: 3 weeks · Price: $900 to $1,800 estimate", printed[5]!.text, printed[6]!.text];
    const { updates, manual } = suggest(compare(printed, edited), [option]);
    expect(updates[0]).toMatchObject({ title: "AWS tooling and chat", fields: { recommended: false, timeline: "3 weeks" }, body: "Centralize site in AWS with chatbot\n\nIt answers in English and Spanish." });
    expect(manual).toEqual([]);
    // The price line changed too, but an estimate's price follows its rate and hours: not suggested
    expect(updates[0]!.fields.cost).toBeUndefined();
  });

  it("lists changes outside any option for neon1 to handle", () => {
    const edited = printed.map((p, i) => (i === 6 ? "Either of us may add small items by email." : p.text));
    const { updates, manual } = suggest(compare(printed, edited), [option]);
    expect(updates).toEqual([]);
    expect(manual).toEqual([expect.objectContaining({ kind: "changed", after: "Either of us may add small items by email." })]);
  });

  it("replaces or removes one paragraph, bullet, or subhead of a description", () => {
    const body = "Today:\nOrders arrive three ways.\n\n- One list\n- A bake sheet";
    expect(replaceInBody(body, "Orders arrive three ways.", "Orders arrive four ways.")).toBe("Today:\nOrders arrive four ways.\n\n- One list\n- A bake sheet");
    expect(replaceInBody(body, "A bake sheet", undefined)).toBe("Today:\nOrders arrive three ways.\n\n- One list");
    expect(replaceInBody(body, "Nothing like it", "x")).toBeUndefined();
  });

  it("leaves out a change already applied from the same copy", () => {
    const edited = printed.map((p) => p.text.replace("Centralize site in AWS with chatbot", "Move the site to AWS and add the chatbot"));
    const changes = compare(printed, edited);
    expect(suggest(changes, [option]).updates[0]!.body).toBe("Move the site to AWS and add the chatbot");
    const applied = { ...option, body: "Move the site to AWS and add the chatbot" };
    expect(suggest(changes, [applied])).toEqual({ updates: [], manual: [] });
  });

  it("shows a changed paragraph word by word", () => {
    expect(words("pay 50% now", "pay 20% now").filter((w) => w.op !== "same")).toEqual([{ op: "del", text: "50%" }, { op: "ins", text: "20%" }]);
  });

  it("reads a Word file's paragraphs, table cells included, the way Google Docs saves them", async () => {
    const z = new JSZip();
    z.file("word/document.xml", '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world &amp; more</w:t></w:r></w:p><w:p/><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>B</w:t></w:r></w:p></w:body></w:document>');
    expect(await docxParagraphs(await z.generateAsync({ type: "arraybuffer" }))).toEqual(["Hello world & more", "Cell", "A B"]);
  });
});


// A Word mark-up only SUGGESTS: it never applies a change, never touches an approved option's signed
// terms (the review drafts revised terms instead), and lists what it could not place
describe("Word mark-up mapping: suggest only, and nothing lost", () => {
  // A real revision's paragraphs: B is a fixed $4,500 option with a 50% deposit
  const snapshot = ProposalSnapshot.parse({
    orgName: "Harborline Outfitters", project: { key: "FLOW-1", name: "Patient intake", summary: "Intake arrives three ways.", outcome: "One way in." },
    options: [{ id: "iB", version: 3, letter: "B", code: "0039-r1-B", title: "Small intake portal", body: "Patients upload once.\n\n- One list\n- A status board", status: "approved", fields: { cost: "$4,500 fixed", pricing: "fixed", timeline: "4 weeks", hours: "about 36 hours", result: "A complete intake reaches the record.", recommended: true, why: "It meets both requirements.", basis: [{ work: "Upload page", hours: 9 }, { work: "Status board", hours: 7 }] } }],
  });
  const rev = { number: 39, rev: 1, issuedAt: "2026-11-01T10:00:00.000Z", checkBy: "2026-12-01", note: "" };
  const printedParas = blockParagraphs(proposalBlocks(rev, snapshot));
  // The option as the review reads it: approved, its terms as signed
  const opt = () => ({ code: "0039-r1-B", title: "Small intake portal", body: "Patients upload once.\n\n- One list\n- A status board", fields: { pricing: "fixed", recommended: true, depositPercent: undefined as number | undefined, cost: "$4,500 fixed", timeline: "4 weeks" } });
  const edit = (f: (t: string) => string) => printedParas.map((p) => f(p.text));

  it("suggests a changed deposit, timeline, and price for an approved option, as data only, leaving its inputs exactly as they were", () => {
    const options = [opt()];
    const was = structuredClone(options);
    const edited = edit((t) => t.replace("Timeline: 4 weeks", "Timeline: 6 weeks").replace("(50% deposit)", "(20% deposit)").replace("Price: $4,500 fixed", "Price: $4,000 fixed"));
    const changes = compare(printedParas, edited);
    const { updates, manual } = suggest(changes, options);
    // Suggestions name the fields and values; nothing was written anywhere
    expect(updates).toHaveLength(1);
    expect(updates[0]!.fields).toMatchObject({ timeline: "6 weeks", cost: "$4,000 fixed", depositPercent: 20 });
    expect(updates[0]!.says.map((x) => x.label).sort()).toEqual(["Deposit up front", "Price", "Timeline"]);
    expect(options).toEqual(was);
    expect(manual).toEqual([]);
    // Asking twice gives the same suggestions: reading a copy has no side effects
    expect(suggest(changes, options)).toEqual({ updates, manual });
  });

  it("is pure: the mapping module imports nothing, so it cannot call the API or apply a change", () => {
    const src = readFileSync(new URL("./markup.ts", import.meta.url), "utf8");
    expect(src.match(/^\s*import\b/gm) ?? []).toEqual([]);
    expect(src).not.toMatch(/fetch\(|api\(|XMLHttpRequest/);
  });

  it("applies to an approved option only as a new draft that revises it, never as an edit of the signed option", () => {
    // No React harness here, so this reads the review's source: its approved-option branch writes a
    // new option that points back at the approved one (or edits the revised copy), never the option
    const src = readFileSync(new URL("../components/Markup.tsx", import.meta.url), "utf8");
    const branch = src.slice(src.indexOf('if (opt.status === "approved") {'), src.indexOf("} else {", src.indexOf('if (opt.status === "approved") {')));
    expect(branch).toContain('method: "POST"');
    expect(branch).toContain("revises: opt.id");
    expect(branch).toContain('status: "draft"');
    // Edits in that branch go to the copy, not to the approved option's own item
    expect(branch).not.toContain("items/${opt.id}");
    // The only place the option itself is edited is the else branch, for an option that isn't approved
    expect(src.match(/items\/\$\{opt\.id\}/g)).toHaveLength(1);
    // And nothing applies unless neon1 presses the button (apply runs from one onClick)
    expect(src.match(/void apply\(/g)).toHaveLength(1);
  });

  it("lists text it could not map: a price worked out from hours, tables, general terms, new requests, and removals", () => {
    const options = [{ ...opt(), fields: { ...opt().fields, pricing: "estimate" } }];
    const edited = edit((t) => t
      // An estimate's price follows its hours, so this is for neon1
      .replace("Price: $4,500 fixed", "Price: $3,000 fixed")
      // A cell of the hours table, and a sentence of the general terms
      .replace("Upload page", "Upload and checking page")
      .replace("Neither of us adds work or cost without a written change, which becomes the next revision.", "Either of us may add small items by email."))
      // A new request outside any option, at the end
      .concat("Please also add a Spanish version.");
    const changes = compare(printedParas, edited);
    const { updates, manual } = suggest(changes, options);
    // Nothing is silently dropped: every change is either suggested or listed
    const suggested = updates.flatMap((u) => u.says.map((x) => x.change));
    for (const c of changes) expect(suggested.includes(c) || manual.includes(c)).toBe(true);
    expect(updates).toEqual([]);
    const after = manual.map((m) => m.after ?? m.before);
    expect(after).toEqual(expect.arrayContaining(["Either of us may add small items by email.", "Please also add a Spanish version."]));
    expect(manual.some((m) => /Upload and checking page/.test(m.after ?? ""))).toBe(true);
    expect(manual.some((m) => /Price: \$3,000 fixed/.test(m.after ?? ""))).toBe(true);
  });

  it("lists an edit that matches no option, and a removed paragraph it could not find in the description", () => {
    const options = [opt()];
    // A removed description paragraph that the stored body no longer has: it cannot be replaced, so it is listed
    const gone = { ...opt(), body: "Something else entirely." };
    const edited = printedParas.map((p) => p.text).filter((t) => t !== "A status board");
    const changes = compare(printedParas, edited);
    expect(suggest(changes, [gone]).manual).toEqual([expect.objectContaining({ kind: "removed", before: "A status board" })]);
    expect(suggest(changes, options).updates[0]!.body).toBe("Patients upload once.\n\n- One list");
    // A change in a paragraph of an option the review doesn't know goes to the manual list too
    expect(suggest(changes, []).manual).toHaveLength(changes.length);
  });
});
