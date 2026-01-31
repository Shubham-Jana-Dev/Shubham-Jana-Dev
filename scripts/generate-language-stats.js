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

    // --- Streak & Date Logic ---
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let streakStartDate = "";
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const reversedDays = [...allDays].reverse();
    const startIdx = reversedDays[0].contributionCount === 0 ? 1 : 0;
    
    // Calculate Current Streak + Start Date
    for (let i = startIdx; i < reversedDays.length; i++) {
      if (reversedDays[i].contributionCount > 0) {
        currentStreak++;
        streakStartDate = new Date(reversedDays[i].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else break;
    }

    // Calculate Longest Streak
    allDays.forEach(d => {
      if (d.contributionCount > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else tempStreak = 0;
    });

    const svg = generateSVG({
      langs: langTotals,
      totalBytes: totalBytes,
      streak: currentStreak,
      longest: longestStreak,
      streakStart: streakStartDate || todayStr,
      streakEnd: todayStr,
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
  
  const graphWidth = 740;
  const graphHeight = 80;
  const points = data.graphDays.map((d, i) => {
    const x = 30 + (i * (graphWidth / 30));
    const y = 330 - (d.contributionCount / data.maxDay * graphHeight);
    return `${x},${y}`;
  });
  
  const areaPath = `M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')} L770,330 L30,330 Z`;

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420" fill="none">
    <style>
      @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      .title { font: 700 18px 'Segoe UI', Arial; fill: #7aa2f7; }
      .label { font: 600 12px 'Segoe UI', Arial; fill: #7aa2f7; }
      .stat { font: 400 13px 'Segoe UI', Arial; fill: #a9b1d6; }
      .date-sub { font: 400 10px 'Segoe UI', Arial; fill: #565f89; }
      .percent { font: 600 11px 'Segoe UI', Arial; fill: #9ece6a; }
      .grade-text { font: 800 32px Arial; fill: #ff79c6; animation: pulse 2s infinite; }
      .streak-val { font: 800 36px 'Segoe UI', Arial; fill: #bb9af7; }
      .fire { animation: pulse 1.5s infinite; }
    </style>
    <rect width="800" height="420" rx="20" fill="#1a1b26"/>
    
    <g transform="translate(40, 40)">
      <circle cx="60" cy="60" r="55" stroke="#444b6a" stroke-width="4" fill="none"/>
      <circle cx="60" cy="60" r="55" stroke="#7aa2f7" stroke-width="4" fill="none" stroke-dasharray="345" stroke-dashoffset="${345 - (Math.min(data.streak, 100) * 3.45)}" stroke-linecap="round" transform="rotate(-90 60 60)"/>
      <path class="fire" d="M60 15c-4 7-8 10-8 15 0 4 3 7 8 7s8-3 8-7c0-5-4-8-8-15z" fill="#7aa2f7" transform="translate(0, -5)"/>
      <text x="60" y="75" text-anchor="middle" class="streak-val">${data.streak}</text>
      <text x="60" y="140" text-anchor="middle" class="label">CURRENT STREAK</text>
      <text x="60" y="155" text-anchor="middle" class="date-sub">${data.streakStart} - ${data.streakEnd}</text>
      <text x="60" y="175" text-anchor="middle" class="stat" font-size="11">Max: ${data.longest} Days</text>
    </g>

    <g transform="translate(230, 50)">
      <text x="0" y="0" class="title">Activity Impact</text>
      <text x="0" y="35" class="stat">Total Contributions: ${data.totalCon}</text>
      <text x="0" y="60" class="stat">Pull Requests: ${data.prs}</text>
      <text x="0" y="85" class="stat">Total Commits: ${data.commits}</text>
    </g>

    <g transform="translate(440, 50)">
      <circle cx="50" cy="50" r="45" stroke="#ff79c6" stroke-width="2" fill="none" opacity="0.2"/>
      <text x="50" y="62" text-anchor="middle" class="grade-text">${grade}</text>
      <text x="50" y="120" text-anchor="middle" class="label" style="fill:#ff79c6">DEV RANK</text>
    </g>

    <g transform="translate(565, 50)">
      <text x="0" y="0" class="title">Language Stack</text>
      ${topLangs.map((l, i) => {
        const pct = ((l[1] / data.totalBytes) * 100).toFixed(1);
        return `
          <text x="0" y="${32 + i*22}" class="stat">${l[0]}</text>
          <rect x="85" y="${23 + i*22}" width="90" height="7" rx="3.5" fill="#444b6a"/>
          <rect x="85" y="${23 + i*22}" width="${(pct/100)*90}" height="7" rx="3.5" fill="${COLORS[l[0]] || COLORS.Default}"/>
          <text x="185" y="${32 + i*22}" class="percent">${pct}%</text>
        `;
      }).join('')}
    </g>

    <g transform="translate(0, 0)">
      <text x="30" y="225" class="label" style="fill:#9ece6a">30-DAY MOMENTUM PULSE</text>
      <path d="${areaPath}" fill="#9ece6a" fill-opacity="0.1" />
      <path d="M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')}" stroke="#9ece6a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${data.graphDays.map((d, i) => i % 5 === 0 ? `<text x="${30 + i*(graphWidth/30)}" y="355" class="date-sub" text-anchor="middle">${d.date.split('-')[2]}</text>` : '').join('')}
      <line x1="30" y1="330" x2="770" y2="330" stroke="#444b6a" stroke-width="1" opacity="0.5" />
    </g>

    <text x="400" y="395" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="11" fill="#4fd6be" letter-spacing="1.5" opacity="0.8">LOCAL-FIRST | ZERO-SERVER | PRIVACY-FOCUSED</text>
  </svg>`;
}

run();
