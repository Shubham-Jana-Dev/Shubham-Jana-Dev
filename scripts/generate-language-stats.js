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

    // 1. Process Languages & Calculate Percentages
    const langTotals = {};
    let totalBytes = 0;
    user.repositories.nodes.forEach(repo => {
      repo.languages.edges.forEach(edge => {
        langTotals[edge.node.name] = (langTotals[edge.node.name] || 0) + edge.size;
        totalBytes += edge.size;
      });
    });

    const allDays = cal.weeks.flatMap(w => w.contributionDays);
    const last31Days = allDays.slice(-31);
    const maxDayCount = Math.max(...last31Days.map(d => d.contributionCount), 1);

    // 2. Precise Streak Calculation
    let currentStreak = 0;
    const reversedDays = [...allDays].reverse();
    const startIdx = reversedDays[0].contributionCount === 0 ? 1 : 0;
    for (let i = startIdx; i < reversedDays.length; i++) {
      if (reversedDays[i].contributionCount > 0) currentStreak++;
      else break;
    }

    // 3. Generate SVG
    const svg = generateSVG({
      langs: langTotals,
      totalBytes: totalBytes,
      streak: currentStreak,
      totalCon: cal.totalContributions,
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
  const grade = data.totalCon > 1000 ? "S++" : data.totalCon > 500 ? "A+" : "A";
  const points = data.graphDays.map((d, i) => `${30 + (i * 13.5)},${340 - (d.contributionCount / data.maxDay * 40)}`).join(' ');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="500" height="420" viewBox="0 0 500 420" fill="none">
    <style>
      .label { font: 600 13px 'Segoe UI', Arial; fill: #7aa2f7; }
      .stat { font: 400 12px 'Segoe UI', Arial; fill: #a9b1d6; }
      .percent { font: 400 11px 'Segoe UI', Arial; fill: #565f89; }
      .grade { font: 800 22px Arial; fill: #ff79c6; }
      .streak-val { font: 800 28px 'Segoe UI', Arial; fill: #bb9af7; }
    </style>
    <rect width="500" height="420" rx="15" fill="#1a1b26"/>
    
    <g transform="translate(30, 40)">
      <circle cx="45" cy="45" r="40" stroke="#444b6a" stroke-width="4" fill="none"/>
      <circle cx="45" cy="45" r="40" stroke="#7aa2f7" stroke-width="4" fill="none" stroke-dasharray="251" stroke-dashoffset="${251 - (Math.min(data.streak, 100) * 2.51)}" stroke-linecap="round" transform="rotate(-90 45 45)"/>
      <text x="45" y="55" text-anchor="middle" class="streak-val">${data.streak}</text>
      <text x="45" y="105" text-anchor="middle" class="label" style="fill:#bb9af7">Current Streak</text>
    </g>

    <g transform="translate(160, 45)">
      <text x="0" y="0" class="label">Impact &amp; Grade</text>
      <text x="0" y="25" class="stat">Total Activity: ${data.totalCon}</text>
      <text x="0" y="45" class="stat">Pull Requests: ${data.prs}</text>
      <text x="0" y="65" class="stat">Commits: ${data.commits}</text>
      <g transform="translate(0, 80)">
         <circle cx="20" cy="0" r="22" stroke="#ff79c6" stroke-width="2" fill="none" opacity="0.3"/>
         <text x="20" y="7" text-anchor="middle" class="grade">${grade}</text>
      </g>
    </g>

    <g transform="translate(310, 45)">
      <text x="0" y="0" class="label">Language Stack</text>
      ${topLangs.map((l, i) => {
        const pct = ((l[1] / data.totalBytes) * 100).toFixed(1);
        return `
          <text x="0" y="${25 + i*22}" class="stat">${l[0]}</text>
          <rect x="75" y="${17 + i*22}" width="70" height="6" rx="3" fill="#444b6a"/>
          <rect x="75" y="${17 + i*22}" width="${(pct/100)*70}" height="6" rx="3" fill="${COLORS[l[0]] || COLORS.Default}"/>
          <text x="150" y="${25 + i*22}" class="percent">${pct}%</text>
        `;
      }).join('')}
    </g>

    <g transform="translate(30, 220)">
      <text x="0" y="0" class="label" style="fill:#9ece6a">30-Day Contribution Momentum</text>
      <polyline points="${points}" stroke="#9ece6a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="0" y1="125" x2="440" y2="125" stroke="#444b6a" stroke-width="1" />
    </g>
    
    <rect x="25" y="370" width="450" height="30" rx="10" fill="#24283b"/>
    <text x="250" y="389" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="10" fill="#4fd6be">LOCAL-FIRST | ZERO-SERVER | PRIVACY-FOCUSED</text>
  </svg>`;
}

run();
