const fs = require('fs');
const { Octokit } = require('octokit');

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GH_USERNAME;

async function run() {
  try {
    // 1. Get all repos
    const reposResponse = await octokit.request('GET /users/{username}/repos', {
      username: owner,
      per_page: 100
    });
    
    const totals = {};

    // 2. Get languages for each repo
    for (const r of reposResponse.data) {
      if (r.fork) continue; 
      const langResponse = await octokit.request('GET /repos/{owner}/{repo}/languages', {
        owner: owner,
        repo: r.name
      });
      
      for (const [lang, bytes] of Object.entries(langResponse.data)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    }

    const sorted = Object.entries(totals)
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 6);

    const sum = sorted.reduce((a, b) => a + b.bytes, 0);
    
    // 3. Generate SVG
    const svg = generateSVG(sorted, sum);
    fs.writeFileSync('language-stats.svg', svg);
    console.log("Successfully generated language-stats.svg");
  } catch (e) {
    console.error("Error details:", e.message);
    process.exit(1);
  }
}

function generateSVG(data, total) {
  const width = 400;
  const rowHeight = 40;
  const height = data.length * rowHeight + 20;
  
  const rows = data.map((item, i) => {
    const pct = ((item.bytes / total) * 100).toFixed(1);
    const barWidth = (item.bytes / total) * 250;
    return `
      <text x="10" y="${35 + i * rowHeight}" fill="#9fef00" font-family="Segoe UI, sans-serif" font-size="14">${item.name}</text>
      <rect x="110" y="${25 + i * rowHeight}" width="250" height="10" rx="5" fill="#1e293b" />
      <rect x="110" y="${25 + i * rowHeight}" width="${barWidth}" height="10" rx="5" fill="#9fef00" />
      <text x="365" y="${35 + i * rowHeight}" fill="#94a3b8" font-family="Segoe UI, sans-serif" font-size="12">${pct}%</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#0d1117" rx="10" />
    ${rows}
  </svg>`;
}

run();
