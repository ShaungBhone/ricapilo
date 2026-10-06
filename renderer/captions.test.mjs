import {test} from 'node:test';import assert from 'node:assert/strict';import {time,subtitles,escapeAss} from './captions.mjs';
test('caption times carry across minutes and hours',()=>{assert.equal(time(61010),'0:01:01.01');assert.equal(time(3600000),'1:00:00.00');});
test('captions preserve Burmese and strip ASS directives',()=>{const out=subtitles([{text:'မင်္ဂလာပါ {\\pos(0,0)}',startMs:0,endMs:1500}],true);assert.match(out,/Noto Sans Myanmar/);assert.match(out,/မင်္ဂလာပါ/);assert.ok(!out.includes('{\\pos'));});
