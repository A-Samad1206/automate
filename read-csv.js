import fs from 'fs';
import { parse } from 'csv-parse/sync';

const file = fs.readFileSync('data.csv');
const records = parse(file, {
  columns: true, // converts to array of objects
  skip_empty_lines: true,
});

console.log(records);
// Output: [{col1: 'value1', col2: 'value2'}, ...]
