// publish-queue.txt の先頭から、公開できる記事を1本だけ published: true にする。
// 使い方: node scripts/publish-next.js [--dry-run]
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const queuePath = path.join(root, "publish-queue.txt");
const dryRun = process.argv.includes("--dry-run");

const lines = fs.readFileSync(queuePath, "utf8").split("\n");
const isSlug = (l) => l.trim() !== "" && !l.trim().startsWith("#");

for (let i = 0; i < lines.length; i++) {
  if (!isSlug(lines[i])) continue;
  const slug = lines[i].trim();
  const file = path.join(root, "articles", `${slug}.md`);

  if (!fs.existsSync(file)) {
    console.log(`skip: ${slug} (ファイルが無い)`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  const fm = text.match(/^---\n[\s\S]*?\n---/);
  if (!fm || !/^published: false$/m.test(fm[0])) {
    // すでに公開済み、または frontmatter が想定外: キューから外して次へ
    console.log(`drop: ${slug} (published: false ではない)`);
    lines[i] = null;
    continue;
  }

  const updated = fm[0].replace(/^published: false$/m, "published: true");
  console.log(`publish: ${slug}`);
  if (!dryRun) {
    fs.writeFileSync(file, text.replace(fm[0], updated));
    lines[i] = null;
    fs.writeFileSync(queuePath, lines.filter((l) => l !== null).join("\n"));
  }
  if (process.env.GITHUB_OUTPUT && !dryRun) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\n`);
  }
  process.exit(0);
}

if (!dryRun) fs.writeFileSync(queuePath, lines.filter((l) => l !== null).join("\n"));
console.log("公開できる記事がキューに無い");
