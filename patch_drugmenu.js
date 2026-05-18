const fs = require('fs');
const file = 'index.mjs';
let text = fs.readFileSync(file, 'utf8');
const re = /!drugstats - Deine Drug-Statistiken anzeigen\r?\n!jailstatus - Haftstatus prüfen/;
const replacement = `!drugstats - Deine Drug-Statistiken anzeigen
!druginventory - Dein Drogeninventar anzeigen
!jailstatus - Haftstatus prüfen`;
if (!re.test(text)) {
  console.error('pattern not found');
  process.exit(1);
}
text = text.replace(re, replacement);
fs.writeFileSync(file, text, 'utf8');
console.log('patched drugmenu');
