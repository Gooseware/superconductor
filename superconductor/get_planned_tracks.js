const fs = require('fs');
const path = require('path');

const tracksPath = path.join(__dirname, 'tracks.md');

function getPlannedTracks() {
    if (!fs.existsSync(tracksPath)) {
        console.error('tracks.md not found');
        return [];
    }

    const content = fs.readFileSync(tracksPath, 'utf8');
    const sections = content.split('---').slice(1);
    
    const tracks = sections.map(section => {
        const statusMatch = section.match(/\[( |~|x)\]/);
        const descriptionMatch = section.match(/\*\*Track: (.*?)\*\*/);
        const linkMatch = section.match(/\*Link: \[(.*?)\]/);
        
        if (!statusMatch || !descriptionMatch || !linkMatch) return null;
        
        return {
            status: statusMatch[1],
            description: descriptionMatch[1],
            link: linkMatch[1]
        };
    }).filter(t => t !== null);
    
    return tracks;
}

const tracks = getPlannedTracks();
console.log(JSON.stringify(tracks, null, 2));
