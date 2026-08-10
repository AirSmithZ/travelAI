/**
 * exportGraphCaptureLimits — adaptive pixelRatio (node, no DOM).
 */
import assert from 'node:assert/strict';
import { pickExportPixelRatio } from './exportGraphCaptureLimits.ts';

assert.equal(pickExportPixelRatio(1200, 800), 2, 'modest size keeps 2x');
assert.ok(pickExportPixelRatio(4200, 2800) < 2, 'wide matrix steps down');
assert.equal(pickExportPixelRatio(9000, 9000), 1, 'near canvas limit uses 1x');

console.log('exportGraphCaptureLimits.test.ts ok');
