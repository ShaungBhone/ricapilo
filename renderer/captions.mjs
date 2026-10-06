export function time(ms){const n=Math.max(0,Math.round(ms/10));return `${Math.floor(n/360000)}:${String(Math.floor(n/6000)%60).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;}
export function escapeAss(text){return String(text).replace(/\\/g,'').replace(/[{}]/g,'').replace(/[\r\n]+/g,'\\N');}
export function subtitles(captions,vertical,style='clean-bottom'){
 const width=vertical?720:1280,height=vertical?1280:720;
 const header=`[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans Myanmar,${vertical?34:30},&H00FFFFFF,&H00FFFFFF,&H00301B13,&H90000000,0,0,0,0,100,100,0,0,${style==='boxed-minimal'?3:1},2,0,2,50,50,${vertical?120:55},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
 return header+captions.map(c=>`Dialogue: 0,${time(c.startMs)},${time(c.endMs)},Default,,0,0,0,,${escapeAss(c.text)}`).join('\n')+'\n';
}
