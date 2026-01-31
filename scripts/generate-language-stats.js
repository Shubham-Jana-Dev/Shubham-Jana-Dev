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

    // 1. Process Languages & Total Bytes for %
    const langTotals = {};
    let totalBytes = 0;
    user.repositories.nodes.forEach(repo => {
      repo.languages.edges.forEach(edge => {
        langTotals[edge.node.name] = (langTotals[edge.node.name] || 0) + edge.size;
        totalBytes += edge.size;
      });
    });

    // 2. Process Graph Data (Last 31 Days)
    const allDays = cal.weeks.flatMap(w => w.contributionDays);
    const last31Days = allDays.slice(-31);
    const maxDayCount = Math.max(...last31Days.map(d => d.contributionCount), 1);

    // 3. Streak Calculation
    let currentStreak = 0;
    const reversedDays = [...allDays].reverse();
    const startIdx = reversedDays[0].contributionCount === 0 ? 1 : 0;
    for (let i = startIdx; i < reversedDays.length; i++) {
      if (reversedDays[i].contributionCount > 0) currentStreak++;
      else break;
    }

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
  
  // Create Area Graph Path (Smooth Curves)
  const graphWidth = 440;
  const graphHeight = 60;
  const points = data.graphDays.map((d, i) => {
    const x = 30 + (i * (graphWidth / 30));
    const y = 340 - (d.contributionCount / data.maxDay * graphHeight);
    return `${x},${y}`;
  });
  
  const pathData = `M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')} L470,340 L30,340 Z`;

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="500" height="420" viewBox="0 0 500 420" fill="none">
    <style>
      .label { font: 600 13px 'Segoe UI', Arial; fill: #7aa2f7; }
      .stat { font: 400 12px 'Segoe UI', Arial; fill: #a9b1d6; }
      .percent { font: 600 11px 'Segoe UI', Arial; fill: #9ece6a; }
      .grade { font: 800 22px Arial; fill: #ff79c6; }
      .streak-val { font: 800 28px 'Segoe UI', Arial; fill: #bb9af7; }
    </style>
    <rect width="500" height="420" rx="15" fill="#1a1b26"/>
    
    <g transform="translate(35, 45)">
      <circle cx="45" cy="45" r="40" stroke="#444b6a" stroke-width="4" fill="none"/>
      <circle cx="45" cy="45" r="40" stroke="#7aa2f7" stroke-width="4" fill="none" stroke-dasharray="251" stroke-dashoffset="${251 - (Math.min(data.streak, 100) * 2.51)}" stroke-linecap="round" transform="rotate(-90 45 45)"/>
      <text x="45" y="55" text-anchor="middle" class="streak-val">${data.streak}</text>
      <text x="45" y="105" text-anchor="middle" class="label" style="fill:#bb9af7">Current Streak</text>
    </g>

    <g transform="translate(165, 50)">
      <text x="0" y="0" class="label">Impact</text>
      <text x="0" y="25" class="stat">Contributions: ${data.totalCon}</text>
      <text x="0" y="45" class="stat">Pull Requests: ${data.prs}</text>
      <text x="0" y="65" class="stat">Grade: ${grade}</text>
      <path d="M0 85 h100" stroke="#444b6a" stroke-width="1"/>
    </g>

    <g transform="translate(315, 50)">
      <text x="0" y="0" class="label">Top Stack</text>
      ${topLangs.map((l, i) => {
        const pct = ((l[1] / data.totalBytes) * 100).toFixed(1);
        return `
          <text x="0" y="${25 + i*22}" class="stat">${l[0]}</text>
          <rect x="70" y="${17 + i*22}" width="65" height="6" rx="3" fill="#444b6a"/>
          <rect x="70" y="${17 + i*22}" width="${(pct/100)*65}" height="6" rx="3" fill="${COLORS[l[0]] || COLORS.Default}"/>
          <text x="140" y="${25 + i*22}" class="percent">${pct}%</text>
        `;
      }).join('')}
    </g>

    <g transform="translate(0, 10)">
      <text x="30" y="230" class="label" style="fill:#9ece6a">30-Day Momentum Pulse</text>
      <path d="${pathData}" fill="#9ece6a" fill-opacity="0.1" />
      <path d="M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')}" stroke="#9ece6a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    
    <rect x="25" y="370" width="450" height="30" rx="10" fill="#24283b"/>
    <text x="250" y="389" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="10" fill="#4fd6be">LOCAL-FIRST | ZERO-SERVER | PRIVACY-FOCUSED</text>
  </svg>`;
}

run();
