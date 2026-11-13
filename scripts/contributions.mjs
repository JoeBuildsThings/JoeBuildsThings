import { readFileSync, writeFileSync } from "node:fs";

const login = process.env.GH_LOGIN;
const token = process.env.GITHUB_TOKEN;
const fixture = process.env.CONTRIB_FIXTURE;

const QUERY = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel weekday}}}}}}`;

async function loadCalendar() {
  if (fixture) return JSON.parse(readFileSync(fixture, "utf8"));
  if (!login || !token) throw new Error("Missing GH_LOGIN or GITHUB_TOKEN");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "profilereadme",
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`);
  const json = await res.json();
  const cal = json?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error(`No calendar data: ${JSON.stringify(json.errors ?? json)}`);
  return cal;
}

const COLORS = {
  NONE: "#161c24",
  FIRST_QUARTILE: "#173d27",
  SECOND_QUARTILE: "#1f6f3d",
  THIRD_QUARTILE: "#2ea043",
  FOURTH_QUARTILE: "#56d364",
};
const BG = "#0b0f14", LINE = "#2a323d", INK = "#f0f3f6", MUTE = "#8b949e";
const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function streaks(weeks) {
  const days = weeks.flatMap((w) => w.contributionDays).sort((a, b) => (a.date < b.date ? -1 : 1));
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.contributionCount > 0) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  const rev = [...days].reverse();
  for (let k = 0; k < rev.length; k += 1) {
    const c = rev[k].contributionCount;
    if (k === 0 && c === 0) continue;
    if (c > 0) current += 1;
    else break;
  }
  return { longest, current };
}

function render(cal) {
  const weeks = cal.weeks;
  const pitch = 15, cell = 12, top = 96, W = 880;
  const gridW = weeks.length * pitch;
  const x0 = Math.round((W - gridW) / 2) + 8;
  const H = top + 7 * pitch + 64;
  const { longest, current } = streaks(weeks);
  const stamp = new Date().toISOString().slice(0, 10);

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">`;
  out += `<title id="t">GitHub contributions</title><desc id="d">${cal.totalContributions} contributions in the last year, longest streak ${longest} days, current streak ${current} days. Updated ${stamp}.</desc>`;
  out += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${BG}" stroke="${LINE}" stroke-width="2"/>`;
  out += `<text x="32" y="46" font-family="${SANS}" font-size="24" font-weight="800" fill="${INK}">Contributions</text>`;
  out += `<text x="${W - 32}" y="44" text-anchor="end" font-family="${MONO}" font-size="13" fill="${MUTE}">${cal.totalContributions} in the last year  |  longest streak ${longest}  |  current streak ${current}</text>`;

  let lastMonth = null;
  let lastIdx = null;
  weeks.forEach((w, i) => {
    const m = new Date(`${w.contributionDays[0].date}T00:00:00Z`).getUTCMonth();
    if (m !== lastMonth && (lastIdx === null || i - lastIdx >= 3)) {
      out += `<text x="${x0 + i * pitch}" y="${top - 12}" font-family="${MONO}" font-size="11" fill="${MUTE}">${MONTHS[m]}</text>`;
      lastMonth = m;
      lastIdx = i;
    }
  });
  [[1, "Mon"], [3, "Wed"], [5, "Fri"]].forEach(([row, label]) => {
    out += `<text x="${x0 - 8}" y="${top + row * pitch + 10}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${MUTE}">${label}</text>`;
  });
  weeks.forEach((w, i) => {
    w.contributionDays.forEach((d) => {
      const fill = COLORS[d.contributionLevel] ?? COLORS.NONE;
      out += `<rect x="${x0 + i * pitch}" y="${top + d.weekday * pitch}" width="${cell}" height="${cell}" rx="2" fill="${fill}"><title>${d.contributionCount} contributions on ${d.date}</title></rect>`;
    });
  });

  const ly = top + 7 * pitch + 30;
  out += `<text x="${x0}" y="${ly + 9}" font-family="${MONO}" font-size="11" fill="${MUTE}">Updated ${stamp}</text>`;
  const lx = W - 32 - (5 * pitch + 70);
  out += `<text x="${lx}" y="${ly + 9}" text-anchor="end" font-family="${MONO}" font-size="11" fill="${MUTE}">Less</text>`;
  ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"].forEach((k, i) => {
    out += `<rect x="${lx + 8 + i * pitch}" y="${ly}" width="${cell}" height="${cell}" rx="2" fill="${COLORS[k]}"/>`;
  });
  out += `<text x="${lx + 8 + 5 * pitch + 6}" y="${ly + 9}" font-family="${MONO}" font-size="11" fill="${MUTE}">More</text>`;
  out += `</svg>\n`;
  return out;
}

const calendar = await loadCalendar();
writeFileSync(process.env.CONTRIB_OUT || "assets/contributions.svg", render(calendar));
console.log(`Wrote graph: ${calendar.totalContributions} contributions`);
