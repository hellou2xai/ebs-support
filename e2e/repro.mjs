// Headless reproduction: login, open Track dashboard, click a PAT and an RCA link,
// dump what the detail modal actually renders. Also logs console errors.
import puppeteer from "puppeteer-core";

const EXE = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.env.APP_URL || "http://localhost:5173";

const browser = await puppeteer.launch({ executablePath: EXE, headless: "new" });
const page = await browser.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

await page.setViewport({ width: 1500, height: 1000 });
await page.goto(URL, { waitUntil: "networkidle0" });

// Login if the login screen is shown.
if (await page.$(".login-card")) {
  await page.type(".login-field input", "admin");
  await page.type(".login-field input[type=password]", "admin");
  await page.click(".login-btn");
  await page.waitForSelector(".tabs", { timeout: 10000 });
}

// Go to Track dashboard.
const tabs = await page.$$(".tabs button");
for (const t of tabs) {
  const txt = await t.evaluate(el => el.textContent);
  if (txt.includes("Track dashboard")) { await t.click(); break; }
}
await page.waitForSelector(".pat-table", { timeout: 10000 });

async function clickAndDump(selector, label) {
  const link = await page.$(selector);
  if (!link) { console.log(`${label}: LINK NOT FOUND (${selector})`); return; }
  const txt = await link.evaluate(el => el.textContent);
  console.log(`${label}: clicking "${txt}"`);
  await link.click();
  try {
    await page.waitForSelector(".modal", { timeout: 5000 });
    await new Promise(r => setTimeout(r, 800)); // let data load
    const head = await page.$eval(".modal-head", el => el.innerText.replace(/\n/g, " | "));
    const bodyText = await page.$eval(".modal-body", el => el.innerText.trim());
    console.log(`  modal head: ${head}`);
    console.log(`  modal body length: ${bodyText.length}`);
    console.log(`  modal body first 250: ${bodyText.slice(0, 250).replace(/\n/g, " / ")}`);
    await page.click(".modal-x");
    await new Promise(r => setTimeout(r, 300));
  } catch (e) {
    console.log(`  MODAL PROBLEM: ${e.message}`);
  }
}

await clickAndDump(".pat-table a.inc-link.pat", "PATTERN");
await clickAndDump(".pat-table a.inc-link.rca", "RCA");

console.log("console errors:", errors.length ? errors : "none");
await browser.close();
