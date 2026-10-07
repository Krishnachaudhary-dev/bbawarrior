/** Syntax gate: parses each file with @babel/parser (JSX aware) and fails on the
    first syntax error. Used before every build so a broken edit is caught in
    milliseconds rather than by a browser. */
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

let bad = 0;
for (const file of process.argv.slice(2)) {
  try {
    parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    console.log('OK   ' + file);
  } catch (err) {
    bad = 1;
    console.log('FAIL ' + file + ' - ' + err.message);
  }
}
process.exit(bad);
