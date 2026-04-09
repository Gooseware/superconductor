const tracks = JSON.parse(process.argv[2] || '[]');
const options = tracks
    .filter(t => t.status === ' ' || t.status === '~')
    .map(t => ({
        label: t.description,
        description: `Status: ${t.status === ' ' ? 'New' : 'In Progress'}`
    }));

console.log(JSON.stringify(options, null, 2));
