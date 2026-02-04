const fs = require('fs');
const { Octokit } = require('octokit');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GH_USERNAME;

const COLORS = {
  JavaScript: '#f1e05a', HTML: '#e34c26', CSS: '#563d7c',
  Python: '#3572A5', TypeScript: '#3178c6', 'C++': '#f34b7d', 
  C: '#555555', Default: '#9ece6a'
};

async function run() {
  try {
    const query = `query($owner:String!) {
      user(login: $owner) {
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          nodes { 
            languages(first: 20, orderBy: {field: SIZE, direction: DESC}) { 
              edges { size node { name } } 
            } 
          }
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
    let totalBytes = 0;
    user.repositories.nodes.forEach(repo => {
      repo.languages.edges.forEach(edge => {
        const name = edge.node.name;
        if (name !== "Jupyter Notebook") { // Keeps the focus on pure source code
          langTotals[name] = (langTotals[name] || 0) + edge.size;
          totalBytes += edge.size;
        }
      });
    });

    const allDays = cal.weeks.flatMap(w => w.contributionDays);
    const last31Days = allDays.slice(-31);
    const maxDayCount = Math.max(...last31Days.map(d => d.contributionCount), 1);

    const reversedDays = [...allDays].reverse();
    let currentStreak = 0;
    let startIndex = reversedDays[0].contributionCount === 0 ? 1 : 0;
    for (let i = startIndex; i < reversedDays.length; i++) {
      if (reversedDays[i].contributionCount > 0) currentStreak++;
      else if (currentStreak > 0) break;
    }

    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const startDate = new Date(allDays[allDays.length - currentStreak]?.date || new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const svg = generateSVG({
      langs: langTotals,
      totalBytes: totalBytes,
      streak: currentStreak,
      totalCon: cal.totalContributions,
      prs: user.contributionsCollection.totalPullRequestContributions,
      commits: user.contributionsCollection.totalCommitContributions,
      graphDays: last31Days,
      maxDay: maxDayCount,
      streakStart: startDate,
      streakEnd: todayStr 
    });

    fs.writeFileSync('profile-stats.svg', svg);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

function generateSVG(data) {
  const topLangs = Object.entries(data.langs).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const graphWidth = 740;
  const graphHeight = 70;
  const points = data.graphDays.map((d, i) => {
    const x = 30 + (i * (graphWidth / 30));
    const y = 340 - (d.contributionCount / data.maxDay * graphHeight);
    return `${x},${y}`;
  });
  
  const areaPath = `M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')} L770,340 L30,340 Z`;

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420" fill="none">
    <style>
      @keyframes neon-pulse { 
        0%, 100% { stroke-width: 6; filter: drop-shadow(0 0 2px #ff79c6); } 
        50% { stroke-width: 10; filter: drop-shadow(0 0 10px #ff79c6); } 
      }
      .title { font: 700 18px 'Segoe UI', Arial; fill: #7aa2f7; }
      .label { font: 600 12px 'Segoe UI', Arial; fill: #7aa2f7; }
      .stat { font: 400 13px 'Segoe UI', Arial; fill: #a9b1d6; }
      .date-sub { font: 400 9px 'Segoe UI', Arial; fill: #565f89; }
      .percent { font: 600 11px 'Segoe UI', Arial; fill: #9ece6a; }
      .grade-text { font: 800 38px Arial; fill: #ff79c6; }
      .streak-val { font: 800 42px 'Segoe UI', Arial; fill: #bb9af7; }
      .neon-ring { animation: neon-pulse 2s infinite ease-in-out; }
    </style>
    
    <rect width="800" height="420" rx="20" fill="#1a1b26"/>
    
    <g transform="translate(40, 45)">
      <circle cx="60" cy="60" r="55" stroke="#444b6a" stroke-width="4" fill="none"/>
      <circle cx="60" cy="60" r="55" stroke="#7aa2f7" stroke-width="6" fill="none" stroke-dasharray="345" stroke-dashoffset="100" stroke-linecap="round" transform="rotate(-90 60 60)"/>
      <text x="60" y="75" text-anchor="middle" class="streak-val">${data.streak}</text>
      <text x="60" y="140" text-anchor="middle" class="label">CURRENT STREAK</text>
    </g>

    <g transform="translate(220, 50)">
      <text x="0" y="0" class="title">Activity Impact</text>
      <text x="0" y="35" class="stat">Total Contributions: ${data.totalCon}</text>
      <text x="0" y="60" class="stat">Pull Requests: ${data.prs}</text>
      <text x="0" y="85" class="stat">Total Commits: ${data.commits}</text>
      <text x="0" y="115" class="label" style="fill:#bb9af7">Longest: ${data.streak} Days</text>
    </g>

    <g transform="translate(415, 50)">
      <circle cx="50" cy="50" r="46" stroke="#444b6a" stroke-width="4" fill="none" opacity="0.3"/>
      <circle cx="50" cy="50" r="46" class="neon-ring" stroke="#ff79c6" fill="none" stroke-dasharray="144" stroke-dashoffset="40" stroke-linecap="round"/>
      <text x="50" y="64" text-anchor="middle" class="grade-text">A+</text>
      <text x="50" y="120" text-anchor="middle" class="label" style="fill:#ff79c6">DEV RANK</text>
    </g>

    <g transform="translate(560, 50)">
      <text x="0" y="0" class="title">Language Stack</text>
      ${topLangs.map((l, i) => {
        const pct = ((l[1] / data.totalBytes) * 100).toFixed(1);
        const barWidth = (parseFloat(pct) / 100) * 110; // Wider bars
        return `
          <text x="0" y="${32 + i*22}" class="stat">${l[0]}</text>
          <rect x="80" y="${23 + i*22}" width="110" height="7" rx="3.5" fill="#444b6a"/>
          <rect x="80" y="${23 + i*22}" width="${Math.max(barWidth, 2)}" height="7" rx="3.5" fill="${COLORS[l[0]] || COLORS.Default}"/>
          <text x="195" y="${32 + i*22}" class="percent">${pct}%</text>
        `;
      }).join('')}
    </g>

    <g transform="translate(0, 10)">
      <text x="30" y="235" class="label" style="fill:#9ece6a">30-DAY MOMENTUM PULSE</text>
      <path d="${areaPath}" fill="#9ece6a" fill-opacity="0.1" />
      <path d="M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')}" stroke="#9ece6a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${data.graphDays.map((d, i) => {
        if (i % 3 === 0) return `<text x="${30 + i*(graphWidth/30)}" y="365" class="date-sub" text-anchor="middle">${d.date.split('-')[2]}</text>`;
        return '';
      }).join('')}
    </g>

    <text x="400" y="405" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="11" fill="#4fd6be" letter-spacing="1.5" opacity="0.8">LOCAL-FIRST | ZERO-SERVER | PRIVACY-FOCUSED</text>
  </svg>`;
}

run();
