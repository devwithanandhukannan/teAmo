const fs = require('fs');
const file = 'frontend/src/components/ProfileDrawer.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-\[#050505\]/g, 'bg-background');
content = content.replace(/border-white\/10/g, 'border-border');
content = content.replace(/text-gray-400/g, 'text-muted-foreground');
content = content.replace(/hover:text-white/g, 'hover:text-foreground');
content = content.replace(/bg-white\/5/g, 'bg-secondary');
content = content.replace(/hover:bg-white\/10/g, 'hover:bg-accent');
content = content.replace(/border-white\/5/g, 'border-border');
content = content.replace(/text-white/g, 'text-foreground');
content = content.replace(/text-gray-500/g, 'text-muted-foreground');
content = content.replace(/bg-white\/\[0\.01\]/g, 'bg-card');
content = content.replace(/text-gray-300/g, 'text-foreground');
content = content.replace(/text-gray-900/g, 'text-muted-foreground');
content = content.replace(/bg-gray-900/g, 'bg-muted');
content = content.replace(/bg-gray-950/g, 'bg-muted');
content = content.replace(/text-gray-950/g, 'text-foreground');
content = content.replace(/border-white\/20/g, 'border-border');
content = content.replace(/bg-black\/85/g, 'bg-background/80');

fs.writeFileSync(file, content);
console.log('Fixed ProfileDrawer theme classes');
