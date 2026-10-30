const fs = require('fs');
const path = require('path');

const clientDir = __dirname;
const appJsPath = path.join(clientDir, 'src', 'App.js');
const appCssPath = path.join(clientDir, 'src', 'App.css');
const indexPath = path.join(clientDir, 'public', 'index.html');

const appJs = fs.readFileSync(appJsPath, 'utf8');
const appCss = fs.readFileSync(appCssPath, 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#003366" />
  <title>Scheme Source Watcher - Reviewer Dashboard</title>
  <style>
${appCss}
  </style>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script>
    if (window.Babel) {
      window.Babel.registerPreset('react-classic', {
        presets: [
          [window.Babel.availablePresets['react'], { runtime: 'classic' }]
        ]
      });
    }
  </script>
</head>
<body>
  <noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root"></div>
  <script type="text/babel" data-presets="react-classic">
${appJs}
  </script>
</body>
</html>`;

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Successfully generated self-contained index.html, size:', html.length);
