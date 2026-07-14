import fs from "node:fs";

const path = "components/assistant-ui/thread-graph-flow/block-library.tsx";
let source = fs.readFileSync(path, "utf8");
const beforeClass = 'className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"';
const afterClass = 'className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground"';
const beforeStyle = 'style={{ color: block.accent, borderColor: `${block.accent}35` }}';
const afterStyle = 'style={{ borderColor: `${block.accent}70` }}';
if (!source.includes(beforeClass) || !source.includes(beforeStyle)) {
  throw new Error("Could not locate block-library category badge contrast styles.");
}
source = source.replace(beforeClass, afterClass).replace(beforeStyle, afterStyle);
fs.writeFileSync(path, source);
