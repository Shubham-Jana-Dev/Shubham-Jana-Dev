const fs = require('fs');
const { Octokit } = require('octokit');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GH_USERNAME;

const COLORS = {
  JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#563d7c',
  Python: '#3572A5', C: '#a91e2c', TypeScript: '#3178c6', Default: '#9ece6a'
};

async function run() {
  try {
    const query = `query($owner:String!) {
      user(login: $owner) {
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          nodes { languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          contributionCalendar {
            totalContributions
            weeks { contributionDays { contributionCount date } }
          }
        }
      }
    }`;
    
    const result = await octokit.graphql(query, { owner });
    const user = result.user;
    const cal = user.contributionsCollection.contributionCalendar;

    const langTotals = {};
    user.repositories.nodes.forEach(repo => {
      repo.languages.edges.forEach(edge => {
        langTotals[edge.node.name] = (langTotals[edge.node.name] || 0) + edge.size;
      });
    });

    const allDays = cal.weeks.flatMap(w => w.contributionDays);
    const last31Days = allDays.slice(-31);
    const maxDayCount = Math.max(...last31Days.map(d => d.contributionCount), 1);

    // Precise Streak Calculation
    let currentStreak = 0;
    const reversedDays = [...allDays].reverse();
    // If today has no commits, start checking from yesterday
    const startIdx = reversedDays[0].contributionCount === 0 ? 1 : 0;
    for (let i = startIdx; i < reversedDays.length; i++) {
      if (reversedDays[i].contributionCount > 0) currentStreak++;
      else break;
    }

    const svg = generateSVG({
      langs: langTotals,
      streak: currentStreak,
      total: cal.totalContributions,
      prs: user.contributionsCollection.totalPullRequestContributions,
      commits: user.contributionsCollection.totalCommitContributions,
      graphDays: last31Days,
      maxDay: maxDayCount
    });

    fs.writeFileSync('profile-stats.svg', svg);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

function generateSVG(data) {
  const topLangs = Object.entries(data.langs).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const langSum = topLangs.reduce((a,b) => a + b[1], 0);
  const grade = data.total > 1000 ? "S++" : data.total > 500 ? "A+" : "A";
  const points = data.graphDays.map((d, i) => `${30 + (i * 13.5)},${250 - (d.contributionCount / data.maxDay * 50)}`).join(' ');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="480" height="420" viewBox="0 0 480 420" fill="none">
    <style>
      .label { font: 600 14px 'Segoe UI', Arial; fill: #7aa2f7; }
      .stat { font: 400 12px 'Segoe UI', Arial; fill: #a9b1d6; }
      .grade { font: 800 24px Arial; fill: #ff79c6; }
      .streak-val { font: 800 28px 'Segoe UI', Arial; fill: #bb9af7; }
    </style>
    <rect width="480" height="420" rx="15" fill="#1a1b26"/>
    
    <g transform="translate(45, 60)">
      <circle cx="45" cy="45" r="40" stroke="#444b6a" stroke-width="4" fill="none"/>
      <circle cx="45" cy="45" r="40" stroke="#7aa2f7" stroke-width="4" fill="none" stroke-dasharray="251" stroke-dashoffset="${251 - (Math.min(data.streak, 100) * 2.51)}" stroke-linecap="round" transform="rotate(-90 45 45)"/>
      <path d="M45 10c-5 8-10 12-10 18 0 5 4 9 10 9s10-4 10-9c0-6-5-10-10-18z" fill="#7aa2f7" transform="translate(0, -15)"/>
      <text x="45" y="55" text-anchor="middle" class="streak-val">${data.streak}</text>
      <text x="45" y="105" text-anchor="middle" class="label" style="fill:#bb9af7">Current Streak</text>
    </g>

    <g transform="translate(180, 65)">
      <text x="0" y="0" class="label">Impact</text>
      <text x="0" y="25" class="stat">Contributions: ${data.total}</text>
      <text x="0" y="45" class="stat">Pull Requests: ${data.prs}</text>
      <text x="0" y="65" class="stat">Grade: ${grade}</text>
    </g>

    <g transform="translate(320, 65)">
      <text x="0" y="0" class="label">Top Stack</text>
      ${topLangs.map((l, i) => `
        <text x="0" y="${25 + i*18}" class="stat" font-size="10">${l[0]}</text>
        <rect x="65" y="${17 + i*18}" width="70" height="5" rx="2.5" fill="#444b6a"/>
        <rect x="65" y="${17 + i*18}" width="${(l[1]/langSum)*70}" height="5" rx="2.5" fill="${COLORS[l[0]] || COLORS.Default}"/>
      `).join('')}
    </g>

    <text x="25" y="200" class="label" style="fill:#9ece6a">30-Day Momentum Pulse</text>
    <polyline points="${points}" stroke="#9ece6a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    
    <rect x="25" y="360" width="430" height="35" rx="10" fill="#24283b"/>
    <text x="240" y="382" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="11" fill="#4fd6be">LOCAL-FIRST | ZERO-SERVER | PRIVACY-FOCUSED</text>
  </svg>`;
}

run();
