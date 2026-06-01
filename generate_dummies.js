const fs = require('fs');
const path = require('path');
const colors = ['#FFD700', '#8A2BE2', '#4169E1'];
['1.png', '2.png', '3.png'].forEach((name, i) => {
    // Generate simple 1x1 pixel PNGs (base64 encoded) instead of SVG so it actually creates .png files
    // But honestly, the user said they will put their own photos there, so I can just put dummy files or wait for them.
    // Let's just create 1.png, 2.png, 3.png as actual valid minimal pngs.
    const base64Pngs = [
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", // yellow
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", // purple
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADVwHwwt+wUwAAAABJRU5ErkJggg=="  // blue
    ];
    fs.writeFileSync(path.join('public/prizes', name), Buffer.from(base64Pngs[i], 'base64'));
});
console.log("Dummy PNGs created!");
