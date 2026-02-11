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
            stargazerCount
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

    // Calculate Stars
    const totalStars = user.repositories.nodes.reduce((acc, repo) => acc + repo.stargazerCount, 0);

    const langTotals = {};
    let totalBytes = 0;
    user.repositories.nodes.forEach(repo => {
      repo.languages.edges.forEach(edge => {
        const name = edge.node.name;
        if (name !== "Jupyter Notebook") {
          langTotals[name] = (langTotals[name] || 0) + edge.size;
          totalBytes += edge.size;
        }
      });
    });

    const allDays = cal.weeks.flatMap(w => w.contributionDays);
    const last31Days = allDays.slice(-31);
    const maxDayCount = Math.max(...last31Days.map(d => d.contributionCount), 1);

    // Streak Logic
    const reversedDays = [...allDays].reverse();
    let currentStreak = 0;
    let streakActive = true;
    let streakEndDate = reversedDays[0].date;

    for (let day of reversedDays) {
        if (day.contributionCount > 0) {
            currentStreak++;
        } else if (currentStreak > 0) {
            break;
        }
    }
    
    const streakStartDate = new Date(allDays[allDays.length - currentStreak]?.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const svg = generateSVG({
      langs: langTotals,
      totalBytes: totalBytes,
      stars: totalStars,
      streak: currentStreak,
      totalCon: cal.totalContributions,
      prs: user.contributionsCollection.totalPullRequestContributions,
      commits: user.contributionsCollection.totalCommitContributions,
      graphDays: last31Days,
      maxDay: maxDayCount,
      streakStart: streakStartDate,
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
  const graphWidth = 720;
  const graphHeight = 60;
  
  const points = data.graphDays.map((d, i) => {
    const x = 40 + (i * (graphWidth / 30));
    const y = 350 - (d.contributionCount / data.maxDay * graphHeight);
    return `${x},${y}`;
  });
  
  const areaPath = `M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')} L760,350 L40,350 Z`;

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="420" viewBox="0 0 800 420" fill="none">
    <style>
      @keyframes neon-glow { 0%, 100% { opacity: 0.4; stroke-width: 4; } 50% { opacity: 1; stroke-width: 7; } }
      .title { font: 700 18px 'Segoe UI', Arial; fill: #7aa2f7; }
      .label { font: 600 12px 'Segoe UI', Arial; fill: #7aa2f7; }
      .stat { font: 400 13px 'Segoe UI', Arial; fill: #a9b1d6; }
      .date-sub { font: 500 10px 'Segoe UI', Arial; fill: #565f89; }
      .percent { font: 600 11px 'Segoe UI', Arial; fill: #9ece6a; }
      .grade-text { font: 800 38px Arial; fill: #ff79c6; }
      .streak-val { font: 800 42px 'Segoe UI', Arial; fill: #bb9af7; }
      .sparkle { animation: neon-glow 2s infinite ease-in-out; }
    </style>
    
    <rect width="800" height="420" rx="20" fill="#1a1b26"/>
    
    <g transform="translate(50, 50)">
      <circle cx="60" cy="60" r="55" stroke="#444b6a" stroke-width="2" fill="none" opacity="0.3"/>
      <circle cx="60" cy="60" r="55" stroke="#7aa2f7" stroke-width="5" fill="none" stroke-dasharray="345" stroke-dashoffset="80" stroke-linecap="round" transform="rotate(-90 60 60)"/>
      <text x="60" y="72" text-anchor="middle" class="streak-val">${data.streak}</text>
      <text x="60" y="135" text-anchor="middle" class="label">CURRENT STREAK</text>
      <text x="60" y="152" text-anchor="middle" class="date-sub">${data.streakStart} - ${data.streakEnd}</text>
    </g>

    <g transform="translate(230, 55)">
      <text x="0" y="0" class="title">Activity Impact</text>
      <text x="0" y="32" class="stat">Total Contributions: ${data.totalCon}</text>
      <text x="0" y="54" class="stat">Total Commits: ${data.commits}</text>
      <text x="0" y="76" class="stat">Stars Collected: ${data.stars} ★</text>
      <text x="0" y="110" class="label" style="fill:#bb9af7">Longest Streak: ${data.streak} Days</text>
      <text x="0" y="125" class="date-sub">${data.streakStart} - Present</text>
    </g>

    <g transform="translate(435, 55)">
      <circle cx="50" cy="50" r="46" stroke="#444b6a" stroke-width="2" fill="none" opacity="0.3"/>
      <circle cx="50" cy="50" r="46" stroke="#ff79c6" stroke-width="5" fill="none" class="sparkle" stroke-dasharray="200" stroke-dashoffset="40" stroke-linecap="round"/>
      <text x="50" y="64" text-anchor="middle" class="grade-text">A+</text>
      <text x="50" y="120" text-anchor="middle" class="label" style="fill:#ff79c6">DEV RANK</text>
    </g>

    <g transform="translate(580, 55)">
      <text x="0" y="0" class="title">Top Stack</text>
      ${topLangs.map((l, i) => {
        const pct = ((l[1] / data.totalBytes) * 100).toFixed(1);
        const barWidth = (parseFloat(pct) / 100) * 100;
        return `
          <text x="0" y="${30 + i*22}" class="stat">${l[0]}</text>
          <rect x="85" y="${21 + i*22}" width="100" height="6" rx="3" fill="#444b6a"/>
          <rect x="85" y="${21 + i*22}" width="${Math.max(barWidth, 2)}" height="6" rx="3" fill="${COLORS[l[0]] || COLORS.Default}"/>
          <text x="190" y="${30 + i*22}" class="percent">${pct}%</text>
        `;
      }).join('')}
    </g>

    <g transform="translate(0, 20)">
      <text x="40" y="245" class="label" style="fill:#9ece6a">30-DAY MOMENTUM PULSE</text>
      <path d="${areaPath}" fill="#9ece6a" fill-opacity="0.08" />
      <path d="M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')}" stroke="#9ece6a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${data.graphDays.map((d, i) => i % 5 === 0 ? `<text x="${40 + i*(graphWidth/30)}" y="375" class="date-sub" text-anchor="middle">${d.date.split('-')[2]}</text>` : '').join('')}
    </g>

    <text x="400" y="405" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="10" fill="#4fd6be" letter-spacing="2" opacity="0.6">LOCAL-FIRST | ZERO-SERVER | PRIVACY-FOCUSED</text>
  </svg>`;
}

run();
