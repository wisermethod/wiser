// Shared contract cases exercise the validator and the direct browser renderer.
export const acceptedDepths = [
  {}, ...['plain','gradient','texture'].map(background=>({background,...(background==='gradient'?{groundTo:'panel'}:{})})),
  ...['linear','radial'].map(gradient=>({background:'gradient',gradient,groundTo:'#eee',groundThird:'ground'})),
  ...[-720,0,120,360].map(angle=>({background:'gradient',groundTo:'panel',angle})),
  ...['pattern','grain'].map(texture=>({background:'texture',texture})),
  ...[0,12,24,'pill'].map(corner=>({block:{corner}})), ...[0,16,28].map(corner=>({card:{corner}})),
  ...[false,true,'lighter','darker'].map(inset=>({block:{inset}})),
  ...[false,true].map(gradient=>({block:{gradient},...(gradient?{popTo:'#444'}:{})})),
  ...['three','none','strip','six'].map(band=>({band})),
  ...['badge','initials','seal','letter','stack'].map(mark=>({mark})),
  ...['ground','block'].flatMap(on=>[{mark:'seal',seal:{on}},{mark:'stack',stack:{on}}]),
  ...['pop','mark','deep','text','headline'].map(ink=>({ink})),
  {groundTo:'#abc',groundThird:'text',popTo:'pop',allowHueShift:false},
  {background:'gradient',groundTo:'#f00',allowHueShift:true},
  // Nullish optional choices retain the renderer's established defaults.
  {background:null,gradient:null,texture:null,block:null,card:null,band:null,mark:null,seal:null,stack:null,ink:null}
];
export const rejectedDepths = [
  [null,/depth must be an object/], [[],/depth must be an object/], ['plain',/depth must be an object/],
  ...['blur','glass','glow','shadow','drop-shadow'].map(key=>[{[key]:true},/blur, glass, glow and all shadows are forbidden/]),
  [{textGradient:true},/gradient text is forbidden/], [{headlineGradient:true},/gradient text is forbidden/],
  [{block:{initialsGradient:true}},/gradient text is forbidden/],
  ...['background','gradient','texture','band','mark','ink'].map(key=>[{[key]:'unknown'},new RegExp('depth\\.'+key+' must be')]),
  ...['angle','allowHueShift'].flatMap(key=>[null,'1',Infinity,{},[]].map(value=>[{[key]:value},new RegExp('depth\\.'+key+' must be')])),
  ...['block','card','seal','stack'].flatMap(key=>[
    [{[key]:[]},new RegExp('depth\\.'+key+' must be an object')],
    [{[key]:{unknown:true}},new RegExp('depth\\.'+key+'\\.unknown is not supported')],
    [{[key]:{glow:1}},/all shadows are forbidden/]
  ]),
  [{unknown:true},/depth\.unknown is not supported/],
  [{block:{corner:16}},/depth\.block.corner must be/], [{card:{corner:12}},/depth\.card.corner must be/],
  [{block:{gradient:1}},/depth\.block.gradient must be boolean/], [{block:{gradient:null}},/depth\.block.gradient must be boolean/],
  [{block:{inset:'shadow'}},/depth\.block.inset must be/], [{seal:{on:'panel'}},/depth\.seal.on must be/], [{stack:{on:'panel'}},/depth\.stack.on must be/],
  ...['groundTo','groundThird','popTo'].flatMap(key=>['red','rgba(0,0,0,.5)','#1234','unknown',123,null,['panel']].map(value=>[{[key]:value},new RegExp('depth\\.'+key+' must list an opaque hex')])),
  [{background:'gradient'},/depth\.groundTo must list an opaque hex/],
  [{block:{gradient:true}},/depth\.popTo must list an opaque hex/]
];
export const gradientCases = [
  ['#8F68CB','#537BD9',false,/purple-to-blue/], ['#8F68CB','#537BD9',true,/purple-to-blue/],
  ['#1F4FC9','#3563D6',false,null], ['#f5f4f3','#e9eaeb',false,null],
  ['#ff0000','#00ff00',false,/must be tonal/], ['#ff0000','#00ff00',true,null],
  // The shorter arc crosses the purple/blue window even with an endpoint outside it.
  ['#A040CB','#416FD3',true,/purple-to-blue/]
];
export const styleDepths = [
  {mark:'seal',seal:{on:'ground'},background:'gradient',groundTo:'panel',angle:160,card:{corner:0},band:'six'},
  {mark:'badge',background:'gradient',gradient:'radial',groundTo:'panel',card:{corner:28},block:{corner:'pill',inset:'lighter'},band:'six'},
  {mark:'letter',background:'plain',card:{corner:16},block:{corner:12},band:'six'},
  {mark:'stack',stack:{on:'block'},background:'texture',texture:'grain',card:{corner:16},block:{corner:24},band:'six'},
  {mark:'initials',background:'plain',card:{corner:0},band:'six'},
  {mark:'letter',background:'texture',texture:'grain',card:{corner:0},block:{corner:0},band:'six'},
  {mark:'seal',seal:{on:'block'},background:'gradient',groundTo:'panel',angle:200,card:{corner:16},block:{corner:12},band:'six'},
  {mark:'badge',background:'texture',texture:'grain',card:{corner:28},block:{corner:24,inset:'darker'},band:'six'},
  {mark:'initials',background:'gradient',gradient:'radial',groundTo:'panel',card:{corner:28},band:'six'},
  {mark:'stack',stack:{on:'ground'},background:'plain',card:{corner:16},band:'six'}
];
