// Full UI verification: login, branding, KPI click-through to filtered queue,
// open/closed toggle, RCA/PAT modals, persona switch.
import puppeteer from "puppeteer-core";

const EXE = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.env.APP_URL || "http://localhost:5173";
const out = [];
const ok = (name, pass, note = "") => { out.push(`${pass ? "PASS" : "FAIL"}  ${name}${note ? "  (" + note + ")" : ""}`); };

const browser = await puppeteer.launch({ executablePath: EXE, headless: "new" });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.setViewport({ width: 1500, height: 1000 });
await page.goto(URL, { waitUntil: "networkidle0" });

// 1. Login
ok("login screen shown", !!(await page.$(".login-card")));
await page.type(".login-field input", "admin");
await page.type(".login-field input[type=password]", "admin");
await page.click(".login-btn");
await page.waitForSelector(".tabs", { timeout: 10000 });
ok("login admin/admin works", true);

// 2. Branding
const brand = await page.$eval(".brand-title", el => el.textContent);
const bodyHasVertiv = await page.evaluate(() => document.querySelector(".topbar").innerText.includes("Vertiv"));
ok("brand is U2xAI Alice AMS Support", brand === "U2xAI Alice AMS Support", brand);
ok("no Vertiv in header", !bodyHasVertiv);

// 3. Persona home + KPI click-through
await page.waitForSelector(".stat", { timeout: 10000 });
const kpiCount = (await page.$$(".stat.clickable")).length;
ok("clickable KPIs on persona home", kpiCount > 0, `${kpiCount} clickable`);
const firstVal = await page.$eval(".stat.clickable .stat-val", el => el.textContent);
await page.click(".stat.clickable");
await page.waitForSelector(".filter-chip", { timeout: 5000 }).catch(() => {});
const chip = await page.$(".filter-chip");
let chipText = "";
let queueCount = 0;
if (chip) {
  chipText = await chip.evaluate(el => el.textContent);
  queueCount = (await page.$$(".queue-item")).length;
}
ok("KPI click opens filtered queue", !!chip, `kpi=${firstVal} chip="${chipText.trim()}" rows=${queueCount}`);

// 4. Clear filter, check open/closed toggle
if (chip) { await chip.click(); await new Promise(r => setTimeout(r, 400)); }
const toggleBtns = await page.$$(".queue-toggle button");
ok("open/closed toggle present", toggleBtns.length === 2);
let closedInfo = "";
if (toggleBtns.length === 2) {
  const closedLabel = await toggleBtns[1].evaluate(el => el.textContent);
  await toggleBtns[1].click();
  await new Promise(r => setTimeout(r, 400));
  const closedRows = (await page.$$(".queue-item.closed")).length;
  closedInfo = `${closedLabel.trim()}, ${closedRows} closed rows shown`;
  ok("closed incidents list works", closedRows > 0, closedInfo);
  await toggleBtns[0].click();
}

// 5. Track dashboard modal links
const tabs = await page.$$(".tabs button");
for (const t of tabs) { if ((await t.evaluate(el => el.textContent)).includes("Track dashboard")) { await t.click(); break; } }
await page.waitForSelector(".pat-table a.inc-link.pat", { timeout: 8000 });
await page.click(".pat-table a.inc-link.pat");
await page.waitForSelector(".modal-body", { timeout: 5000 });
await new Promise(r => setTimeout(r, 700));
const patLen = await page.$eval(".modal-body", el => el.innerText.trim().length);
ok("pattern modal has content", patLen > 200, `${patLen} chars`);
await page.click(".modal-x"); await new Promise(r => setTimeout(r, 300));
await page.click(".pat-table a.inc-link.rca");
await page.waitForSelector(".modal-body", { timeout: 5000 });
await new Promise(r => setTimeout(r, 700));
const rcaLen = await page.$eval(".modal-body", el => el.innerText.trim().length);
ok("rca modal has content", rcaLen > 200, `${rcaLen} chars`);
await page.click(".modal-x");

// 5b. Nested modal navigation (the blank-page bug path):
// open a resolution modal from the persona home, then click RCA inside it,
// then click a pattern chip inside the RCA view.
for (const t of await page.$$(".tabs button")) {
  if ((await t.evaluate(el => el.textContent)).includes("home")) { await t.click(); break; }
}
await page.waitForSelector(".pat-table a.inc-link", { timeout: 8000 });
await page.click(".pat-table a.inc-link"); // first incident in persona table -> resolution modal
await page.waitForSelector(".modal-body", { timeout: 5000 });
await new Promise(r => setTimeout(r, 700));
const resLen = await page.$eval(".modal-body", el => el.innerText.trim().length);
ok("resolution modal opens from persona home", resLen > 200, `${resLen} chars`);
const rcaInModal = await page.$(".modal-body .kv .inc-link");
if (rcaInModal) {
  await rcaInModal.click();
  await new Promise(r => setTimeout(r, 900));
  const stillAlive = !!(await page.$(".modal-body"));
  const nestedLen = stillAlive ? await page.$eval(".modal-body", el => el.innerText.trim().length) : 0;
  const appAlive = !!(await page.$(".tabs"));
  ok("RCA link inside modal opens RCA (no blank page)", stillAlive && appAlive && nestedLen > 150, `${nestedLen} chars, app alive=${appAlive}`);
  const patChip = await page.$(".modal-body .inc-chip.pat");
  if (patChip) {
    await patChip.click();
    await new Promise(r => setTimeout(r, 900));
    const patNested = (await page.$(".modal-body")) ? await page.$eval(".modal-body", el => el.innerText.trim().length) : 0;
    ok("pattern chip inside RCA modal works", patNested > 150, `${patNested} chars`);
  }
  if (await page.$(".modal-x")) await page.click(".modal-x");
} else {
  ok("RCA link inside modal opens RCA (no blank page)", false, "no link found in modal");
}
await new Promise(r => setTimeout(r, 300));

// 6. Persona switch lands on persona home
await page.select(".role-select select", "Finance Controller");
await new Promise(r => setTimeout(r, 800));
const h2 = await page.$eval(".persona-head h2", el => el.textContent).catch(() => "");
ok("persona switch lands on persona home", h2 === "Financial exposure", h2);

ok("no page errors", errors.length === 0, errors.slice(0, 2).join("; "));
console.log(out.join("\n"));
await browser.close();
