import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const grid = path.join(root, 'packages/grid');
const model = await readFile(path.join(grid, 'src/model.js'), 'utf8');
const view = (await readFile(path.join(grid, 'src/grid.js'), 'utf8')).replace(/^import .*from '\.\/model.js';\r?\n/, '');
const source = model + '\n' + view;
const banner = '/*! Moa JS Grid v0.1.0 | MIT License | See LICENSE */\n';
const plain = source.replace(/^export /gm, '');
await mkdir(path.join(grid, 'dist'), { recursive: true });
await writeFile(path.join(grid, 'dist/moa-grid.mjs'), banner + source + '\nexport default Grid;\n');
await writeFile(path.join(grid, 'dist/moa-grid.js'), banner + '(function () {\n\'use strict\';\n' + plain + '\nglobalThis.MoaGrid = Grid;\n})();\n');
await writeFile(path.join(grid, 'dist/moa-grid.cjs'), banner + "'use strict';\n" + plain + '\nmodule.exports = { Grid, GridModel, parseTSV, toTSV };\n');
await copyFile(path.join(grid, 'src/grid.css'), path.join(grid, 'dist/moa-grid.css'));
await copyFile(path.join(root, 'LICENSE'), path.join(grid, 'LICENSE'));
console.log('Built browser JS, ESM, CommonJS, CSS and license without external dependencies.');
