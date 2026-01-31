const fs = require('fs');
const { Octokit } = require('octokit');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GH_USERNAME;

// Language color mapping
const COLORS = {
  JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#563d7c',
  Python: '#3572A5', C: '#555555', React: '#61dafb',
  TypeScript: '#3178c6', Default: '#9ece6a'
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

    // 1. Process Language Data
    const langTotals = {};
    user.repositories.nodes.forEach(repo => {
      repo.languages.edges.forEach(edge => {
        langTotals[edge.node.name] = (langTotals[edge.node.name] || 0) + edge.size;
      });
    });

    // 2. Process Graph Data (Last 31 Days)
    const allDays = cal.weeks.flatMap(w => w.contributionDays);
    const last31Days = allDays.slice(-31);
    const maxDayCount = Math.max(...last31Days.map(d => d.contributionCount), 1);

    // 3. Process Streak
    let currentStreak = 0;
    const reversedDays = [...allDays].reverse();
    for (let i = 0; i < reversedDays.length; i++) {
      if (reversedDays[i].contributionCount > 0) currentStreak++;
      else if (i > 0) break;
    }

    // 4. Generate SVG
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
    console.error(e);
    process.exit(1);
  }
}

function generateSVG(data) {
  const topLangs = Object.entries(data.langs).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const langSum = topLangs.reduce((a,b) => a + b[1], 0);
  const grade = data.total > 1000 ? "S++" : data.total > 500 ? "A+" : "A";

  // Create Graph Path
  const points = data.graphDays.map((d, i) => {
    const x = 30 + (i * 12.5);
    const y = 240 - (d.contributionCount / data.maxDay * 40);
    return `${x},${y}`;
  }).join(' ');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="480" height="380" viewBox="0 0 480 380" fill="none">
    <style>
      .label { font: 600 14px 'Segoe UI', Arial; fill: #7aa2f7; }
      .stat { font: 400 12px 'Segoe UI', Arial; fill: #a9b1d6; }
      .grade { font: 800 24px Arial; fill: #ff79c6; }
    </style>
    <rect width="480" height="380" rx="15" fill="#1a1b26"/>
    
    <text x="25" y="40" class="label" style="font-size:18px">Shubham's Developer Pulse</text>
    <circle cx="420" cy="40" r="25" stroke="#ff79c6" stroke-width="2" fill="none" stroke-dasharray="120" stroke-dashoffset="30"/>
    <text x="420" y="48" text-anchor="middle" class="grade">${grade}</text>

    <text x="25" y="175" class="label" style="fill:#9ece6a">30-Day Contribution Pulse</text>
    <polyline points="${points}" fill="none" stroke="#9ece6a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${data.graphDays.map((d, i) => i % 5 === 0 ? `<text x="${30 + i*12.5}" y="260" class="stat" font-size="8">${d.date.split('-')[2]}</text>` : '').join('')}

    <g transform="translate(25, 75)">
      <text x="0" y="0" class="label">Impact</text>
      <text x="0" y="25" class="stat">Total Activity: ${data.total}</text>
      <text x="0" y="45" class="stat">Pull Requests: ${data.prs}</text>
      <text x="0" y="65" class="stat">Streak: ${data.streak} Days 🔥</text>
    </g>

    <g transform="translate(260, 75)">
      <text x="0" y="0" class="label">Language Stack</text>
      ${topLangs.map((l, i) => {
        const color = COLORS[l[0]] || COLORS.Default;
        const width = (l[1]/langSum) * 180;
        return `
          <text x="0" y="${25 + i*20}" class="stat" font-size="10">${l[0]}</text>
          <rect x="70" y="${18 + i*20}" width="110" height="6" rx="3" fill="#444b6a"/>
          <rect x="70" y="${18 + i*20}" width="${(l[1]/langSum)*110}" height="6" rx="3" fill="${color}"/>
        `;
      }).join('')}
    </g>

    <rect x="20" y="325" width="440" height="35" rx="10" fill="#24283b"/>
    <text x="240" y="348" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="11" fill="#4fd6be">LOCAL-FIRST | ZERO-SERVER | PRIVACY-FOCUSED</text>
  </svg>`;
}

run();
