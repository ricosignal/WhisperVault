(function(){
'use strict';

var KEY='whispervault_v4_state', OLD_KEY='whispervault_v3_state', AGE='whispervault_age_ok';
var empty={scripts:[],sources:[],scriptbin:[],media:[],prefs:{favoriteVoiceURI:'',rate:1,pitch:1,volume:1,workerUrl:''}};
var state=load(),editId=null,currentScript=null,chunks=[],chunk=0,paused=false,currentAudioId=null;

function $(id){return document.getElementById(id)}
function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){
  try{
    var raw=localStorage.getItem(KEY)||localStorage.getItem(OLD_KEY)||'{}';
    var x=JSON.parse(raw);
    return {scripts:x.scripts||[],sources:x.sources||[],scriptbin:x.scriptbin||[],media:x.media||[],prefs:Object.assign({},empty.prefs,x.prefs||{})}
  }catch(e){return clone(empty)}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2)}
function openD(id){var d=$(id);if(d&&!d.open)d.showModal()}
function closeD(id){var d=$(id);if(d&&d.open)d.close()}
function words(s){return String(s||'').trim().split(/\s+/).filter(Boolean).length}
function uniq(a){return Array.from(new Set(a.filter(Boolean)))}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function matchesQuery(parts,q){
  q=norm(q);if(!q)return true;
  var hay=norm((parts||[]).join(' '));
  return q.split(' ').every(function(token){return hay.indexOf(token)>=0})
}
var SCRIPTBIN_TARGETS=['SPE','SPH','small penis','small cock','tiny penis','prostate'];
var MEDIA_TARGETS=SCRIPTBIN_TARGETS.slice();
function targetMatches(text){
  var n=norm(text);
  return SCRIPTBIN_TARGETS.filter(function(t){return n.indexOf(norm(t))>=0})
}
function tagsFrom(t){
  var a=[],m,re=/\[([^\]]+)\]/g;
  while((m=re.exec(t||''))){
    var v=String(m[1]||'').trim().replace(/\s+/g,' ');
    if(v)a.push(v);
  }
  a=uniq(a);
  var c=a.find(function(x){return /^(F4M|M4F|F4F|M4M|F4A|M4A|A4A)$/i.test(x)});
  return {category:c?c.toUpperCase():'',tags:a.filter(function(x){return x!==c}),brackets:a}
}
function bracketCategories(title){
  return tagsFrom(title).brackets||[]
}
function inferCategory(title){
  var m=String(title||'').match(/\b(F4M|M4F|F4F|M4M|F4A|M4A|A4A)\b/i);
  if(m)return m[1].toUpperCase();
  if(/\basmr\b/i.test(title||''))return 'ASMR';
  if(/romanc|girlfriend|boyfriend/i.test(title||''))return 'Romance';
  if(/comfort|reassur|cuddle|sleep/i.test(title||''))return 'Comfort';
  if(/roleplay|role play/i.test(title||''))return 'Roleplay';
  return 'Soundgasm';
}
function inferTags(title){
  var out=['Soundgasm'],t=String(title||'');
  [['ASMR',/\basmr\b/i],['Romance',/romanc|girlfriend|boyfriend/i],['Comfort',/comfort|reassur|cuddle|sleep/i],['Roleplay',/roleplay|role play/i],['Script Fill',/script\s*fill/i],['SFX',/\bsfx\b/i]].forEach(function(x){if(x[1].test(t))out.push(x[0])});
  var c=inferCategory(t);if(c!=='Soundgasm')out.push(c);
  return uniq(out);
}
function soundgasmMeta(url){
  try{
    var u=new URL(url);if(!/(^|\.)soundgasm\.net$/i.test(u.hostname))return null;
    var p=u.pathname.split('/').filter(Boolean),author=p[0]==='u'&&p[1]?decodeURIComponent(p[1]):'',slug=p[2]?decodeURIComponent(p.slice(2).join('/')):'';
    var title=slug?slug.replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim():(author?'Soundgasm profile · '+author:'Soundgasm');
    return {author:author,title:title,category:inferCategory(title),tags:inferTags(title)}
  }catch(e){return null}
}
function stat(k,v){return '<div class="stat"><strong>'+v+'</strong><span>'+esc(k)+'</span></div>'}

function render(){
  renderScripts();
  renderSources();
  renderScriptbin();
  renderMedia();
  var creators=uniq(state.sources.map(function(x){return x.author||''})).length;
  var favs=state.sources.filter(function(x){return x.favorite}).length+state.scripts.filter(function(x){return x.favorite}).length;
  $('statsRow').innerHTML=stat('Audio',state.sources.length)+stat('Creators',creators)+stat('Videos',state.media.length)+stat('Scripts',state.scripts.length)+stat('Favorites',favs);
  $('emptyState').hidden=state.scripts.length>0;
  $('sourceEmpty').hidden=state.sources.length>0;
  if($('mediaEmpty'))$('mediaEmpty').hidden=state.media.length>0;
  if($('workerSettingText'))$('workerSettingText').textContent=state.prefs.workerUrl?state.prefs.workerUrl:'Not connected';
}

function renderScripts(){
  var q=$('searchInput')?$('searchInput').value.trim():'',cat=$('categoryFilter')?$('categoryFilter').value||'all':'all',sort=$('sortSelect')?$('sortSelect').value||'newest':'newest';
  var cats=uniq(state.scripts.map(function(x){return x.category||''})).sort(),old=$('categoryFilter')?$('categoryFilter').value:'all';
  if($('categoryFilter')){
    $('categoryFilter').innerHTML='<option value="all">All categories</option>'+cats.map(function(c){return '<option>'+esc(c)+'</option>'}).join('');
    $('categoryFilter').value=cats.indexOf(old)>=0?old:'all';cat=$('categoryFilter').value
  }
  var a=state.scripts.filter(function(s){
    return (cat==='all'||s.category===cat)&&matchesQuery([s.title,s.author,(s.tags||[]).join(' '),s.category,s.text],q)
  });
  if(sort==='title')a.sort(function(x,y){return x.title.localeCompare(y.title)});
  else if(sort==='favorites')a.sort(function(x,y){return (y.favorite?1:0)-(x.favorite?1:0)||((y.updatedAt||0)-(x.updatedAt||0))});
  else a.sort(function(x,y){return (y.updatedAt||0)-(x.updatedAt||0)});
  if($('libraryGrid'))$('libraryGrid').innerHTML=a.length?a.map(scriptCard).join(''):(state.scripts.length?'<div class="no-results">No saved scripts match this search.</div>':'');
  if($('scriptSearchCount'))$('scriptSearchCount').textContent=q||cat!=='all'?'Showing '+a.length+' of '+state.scripts.length+' scripts':'Showing all '+state.scripts.length+' scripts';
}
function sourceBrackets(s){
  var list=(s.brackets&&s.brackets.length?s.brackets:bracketCategories(s.title||''));
  if(!s.brackets||!s.brackets.length)s.brackets=list;
  return uniq(list)
}
function rebuildBracketCategories(){
  state.sources.forEach(function(s){
    s.brackets=sourceBrackets(s);
    if(!s.category||s.category==='Soundgasm'){
      var align=s.brackets.find(function(x){return /^(F4M|M4F|F4F|M4M|F4A|M4A|A4A)$/i.test(x)});
      if(align)s.category=align.toUpperCase()
    }
  })
}
function renderSources(){
  rebuildBracketCategories();
  var q=($('sourceSearchInput').value||'').trim().toLowerCase(),cat=$('sourceCategoryFilter').value||'all',sort=$('sourceSortSelect').value||'newest';
  var counts={};
  state.sources.forEach(function(s){sourceBrackets(s).forEach(function(x){counts[x]=(counts[x]||0)+1})});
  var cats=Object.keys(counts).sort(function(a,b){return a.localeCompare(b,undefined,{sensitivity:'base'})}),old=$('sourceCategoryFilter').value;
  $('sourceCategoryFilter').innerHTML='<option value="all">All bracket categories ('+cats.length+')</option>'+cats.map(function(x){return '<option value="'+esc(x)+'">['+esc(x)+'] · '+counts[x]+'</option>'}).join('');
  $('sourceCategoryFilter').value=cats.indexOf(old)>=0?old:'all';
  var a=state.sources.filter(function(s){
    var brackets=sourceBrackets(s),hay=[s.title,s.author,s.category,brackets.join(' '),(s.tags||[]).join(' ')].join(' ').toLowerCase();
    return (cat==='all'||brackets.indexOf(cat)>=0)&&(!q||hay.indexOf(q)>=0)
  });
  if(sort==='title')a.sort(function(x,y){return (x.title||'').localeCompare(y.title||'')});
  else if(sort==='creator')a.sort(function(x,y){return (x.author||'').localeCompare(y.author||'')||(x.title||'').localeCompare(y.title||'')});
  else a.sort(function(x,y){return (y.createdAt||0)-(x.createdAt||0)});
  if($('sourceGrid'))$('sourceGrid').innerHTML=a.length?a.map(sourceCard).join(''):(state.sources.length?'<div class="no-results">No recordings match this search or category.</div>':'');
  if($('sourceSearchCount'))$('sourceSearchCount').textContent=q||cat!=='all'?'Showing '+a.length+' of '+state.sources.length+' recordings':'Showing all '+state.sources.length+' recordings';
}
function mediaSearchUrls(q){
  q=String(q||'').trim();
  var enc=encodeURIComponent(q),plus=encodeURIComponent(q).replace(/%20/g,'+');
  return {
    pornhub:'https://www.pornhub.com/video/search?search='+plus,
    xvideos:'https://www.xvideos.com/?k='+plus,
    xnxx:'https://www.xnxx.com/search/'+enc,
    xhamster:'https://xhamster.com/search/'+enc,
    spankbang:'https://spankbang.com/s/'+plus+'/'
  }
}
function renderMediaSourceLinks(q){
  if(!$('mediaSourceLinks'))return;
  q=String(q||'').trim();
  if(!q){$('mediaSourceLinks').innerHTML='';return}
  var urls=mediaSearchUrls(q),names={pornhub:'Pornhub',xvideos:'XVideos',xnxx:'XNXX',xhamster:'xHamster',spankbang:'SpankBang'};
  $('mediaSourceLinks').innerHTML='<div class="subtle">Open source searches directly:</div><div class="inline-actions left">'+Object.keys(urls).map(function(k){return '<a class="ghost linklike compact" target="_blank" rel="noopener noreferrer" href="'+esc(urls[k])+'">'+names[k]+' ↗</a>'}).join('')+'</div>'
}
function openMediaDiscover(q){
  q=String(q||'').trim();$('mediaDiscoverQuery').value=q;$('mediaDiscoverStatus').textContent='Ready.';renderMediaSourceLinks(q);openD('mediaDiscoverDialog')
}
async function discoverMedia(){
  var q=$('mediaDiscoverQuery').value.trim(),source=$('mediaDiscoverSource').value||'all',base=normalizeWorker(state.prefs.workerUrl);
  if(!q){$('mediaDiscoverStatus').textContent='Enter a search term first.';return}
  renderMediaSourceLinks(q);
  if(!base){$('mediaDiscoverStatus').textContent='Your Worker is not connected. Use one of the source search buttons below.';return}
  $('mediaDiscoverRunBtn').disabled=true;$('mediaDiscoverStatus').textContent='Searching supported sources…';
  try{
    var r=await fetch(base+'/api/video-discover?q='+encodeURIComponent(q)+'&source='+encodeURIComponent(source)+'&limit=60',{cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.error||'Discovery failed');
    var added=0;
    (d.items||[]).forEach(function(item){
      if(!item.url||state.media.some(function(x){return x.url===item.url}))return;
      var tags=uniq((item.tags||[]).concat([q])),mt=targetMatches([q,item.title,item.description,tags.join(' ')].join(' '));
      if(!mt.length)return;
      state.media.push({id:uid(),url:item.url,title:item.title||item.url,site:item.site||siteFromUrl(item.url),thumbnail:item.thumbnail||'',description:item.description||'',tags:tags,matchedTargets:mt,createdAt:Date.now()});added++
    });
    save();
    var sourceNotes=(d.sources||[]).map(function(x){return x.name+': '+x.count+(x.error?' ('+x.error+')':'')}).join(' · ');
    $('mediaDiscoverStatus').textContent='Found '+(d.count||0)+' results. Added '+added+' new matching video'+(added===1?'':'s')+'.'+(sourceNotes?' '+sourceNotes:'');
  }catch(e){
    $('mediaDiscoverStatus').textContent='Automatic discovery is not active on this Worker yet: '+e.message+'. Use the source search buttons below, or update the Worker.'
  }finally{$('mediaDiscoverRunBtn').disabled=false}
}

function renderMedia(){
  if(!$('mediaGrid'))return;
  var q=$('mediaSearchInput').value.trim(),tag=$('mediaTagFilter').value||'all',sort=$('mediaSortSelect').value||'newest';
  var old=$('mediaTagFilter').value||'all',counts={};MEDIA_TARGETS.forEach(function(t){counts[t]=0});
  state.media.forEach(function(x){
    var mt=x.matchedTargets||targetMatches([x.title,(x.tags||[]).join(' '),x.description||''].join(' '));x.matchedTargets=mt;
    mt.forEach(function(t){if(counts[t]!=null)counts[t]++})
  });
  $('mediaTagFilter').innerHTML='<option value="all">All target tags</option>'+MEDIA_TARGETS.map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+' · '+counts[t]+'</option>'}).join('');
  $('mediaTagFilter').value=MEDIA_TARGETS.indexOf(old)>=0?old:'all';tag=$('mediaTagFilter').value;
  $('mediaTargetChips').innerHTML=MEDIA_TARGETS.map(function(t){return '<button class="target-chip" type="button" data-media-chip="'+esc(t)+'"><strong>'+esc(t)+'</strong> · '+counts[t]+'</button>'}).join('');
  var a=state.media.filter(function(x){
    var mt=x.matchedTargets||[];
    return (tag==='all'||mt.indexOf(tag)>=0)&&matchesQuery([x.title,x.site,(x.tags||[]).join(' '),x.description||'',mt.join(' ')],q)
  });
  if(sort==='title')a.sort(function(x,y){return (x.title||'').localeCompare(y.title||'')});
  else if(sort==='site')a.sort(function(x,y){return (x.site||'').localeCompare(y.site||'')||(x.title||'').localeCompare(y.title||'')});
  else a.sort(function(x,y){return (y.createdAt||0)-(x.createdAt||0)});
  $('mediaGrid').innerHTML=a.length?a.map(mediaCard).join(''):(state.media.length?'<div class="no-results">No videos match this search or tag.</div>':'');
  $('mediaSearchCount').textContent=q||tag!=='all'?'Showing '+a.length+' of '+state.media.length+' videos':'Showing all '+state.media.length+' videos';
  $('mediaEmpty').hidden=state.media.length>0
}
function mediaCard(s){
  var mt=(s.matchedTargets||[]).map(function(t){return '<span class="scriptbin-match">'+esc(t)+'</span>'}).join('');
  var extra=(s.tags||[]).filter(function(t){return (s.matchedTargets||[]).indexOf(t)<0}).slice(0,5).map(function(t){return '<span class="tag">['+esc(t)+']</span>'}).join('');
  var thumb=s.thumbnail?'<img class="media-thumb" src="'+esc(s.thumbnail)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;media-thumb-placeholder&quot;>▶</div>\'">':'<div class="media-thumb-placeholder">▶</div>';
  return '<article class="media-card"><a class="media-link" target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'"><div class="media-thumb-wrap">'+thumb+'<div class="media-play-badge">▶</div></div></a><div class="media-card-body"><div class="eyebrow">VIDEO LINK</div><h4>'+esc(s.title||s.url)+'</h4><div class="media-site">'+esc(s.site||'External site')+'</div><div class="tag-row">'+mt+extra+'</div><div class="card-actions"><a class="primary linklike" target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'">Open video ↗</a><button class="ghost" data-media-refresh="'+s.id+'">Refresh thumbnail</button><button class="danger" data-media-delete="'+s.id+'">Remove</button></div></div></article>'
}
function siteFromUrl(url){
  try{return new URL(url).hostname.replace(/^www\./,'')}catch(e){return ''}
}
function parseLooseTags(text){
  var bracketed=bracketCategories(text||'');
  var comma=String(text||'').replace(/\[[^\]]+\]/g,'').split(/[,;]+/).map(function(x){return x.trim()}).filter(Boolean);
  return uniq(bracketed.concat(comma))
}
function parseMediaLine(line){
  var parts=String(line||'').split('|'),url=(parts.shift()||'').trim(),title=(parts.shift()||'').trim(),tagText=parts.join('|').trim();
  if(!/^https?:\/\//i.test(url))return null;
  var tags=parseLooseTags(tagText+' '+title),targets=targetMatches([title,tags.join(' ')].join(' '));
  return {id:uid(),url:url,title:title||'',site:siteFromUrl(url),thumbnail:'',description:'',tags:tags,matchedTargets:targets,createdAt:Date.now()}
}
async function fetchMediaMeta(item){
  var base=normalizeWorker(state.prefs.workerUrl);if(!base)return item;
  try{
    var r=await fetch(base+'/api/media-meta?url='+encodeURIComponent(item.url),{cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.error||'Metadata unavailable');
    item.title=d.title||item.title||item.url;
    item.thumbnail=d.thumbnail||item.thumbnail||'';
    item.description=d.description||item.description||'';
    item.site=d.site||item.site||siteFromUrl(item.url);
    item.tags=uniq((item.tags||[]).concat(d.tags||[]));
    item.matchedTargets=targetMatches([item.title,item.description,item.tags.join(' ')].join(' '));
  }catch(e){}
  return item
}
async function discoverMediaQuery(query){
  var base=normalizeWorker(state.prefs.workerUrl);if(!base)throw new Error('Connect your WhisperVault Worker first.');
  var r=await fetch(base+'/api/media-discover?query='+encodeURIComponent(query),{cache:'no-store'});
  var d=await r.json();if(!r.ok)throw new Error(d.error||'Video discovery failed');
  var targetFromQuery=targetMatches(query);
  return (d.items||[]).map(function(item){
    var tags=uniq((item.tags||[]).concat(targetFromQuery));
    return {id:uid(),url:item.url,title:item.title||item.url,site:item.site||siteFromUrl(item.url),thumbnail:item.thumbnail||'',description:item.description||'',tags:tags,matchedTargets:uniq((item.matchedTargets||[]).concat(targetFromQuery)),createdAt:Date.now()}
  })
}
async function discoverAllMedia(){
  var btn=$('mediaDiscoverAllBtn'),base=normalizeWorker(state.prefs.workerUrl);
  if(!base){alert('Connect your WhisperVault Worker first.');return}
  btn.disabled=true;var added=0,found=0,failed=0;
  for(var i=0;i<MEDIA_TARGETS.length;i++){
    btn.textContent='Searching '+(i+1)+'/'+MEDIA_TARGETS.length+'…';
    try{
      var items=await discoverMediaQuery(MEDIA_TARGETS[i]);found+=items.length;
      items.forEach(function(item){
        if(!item.url||state.media.some(function(x){return x.url===item.url}))return;
        state.media.push(item);added++
      })
    }catch(e){failed++}
  }
  save();btn.disabled=false;btn.textContent='⌕ Discover target videos';
  alert('Discovery found '+found+' results and added '+added+' new video links.'+(failed?' '+failed+' searches could not be completed.':''))
}
async function importMediaLinks(){
  var lines=$('mediaPasteInput').value.split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean).slice(0,50);
  if(!lines.length){$('mediaAddStatus').textContent='Enter a search term or public video-page URL.';return}
  $('mediaImportBtn').disabled=true;var added=0,skipped=0,found=0,fetchMeta=$('mediaFetchMeta').checked;
  for(var i=0;i<lines.length;i++){
    $('mediaAddStatus').textContent='Checking '+(i+1)+' of '+lines.length+'…';
    if(!/^https?:\/\//i.test(lines[i])){
      try{
        var results=await discoverMediaQuery(lines[i]);found+=results.length;
        results.forEach(function(item){
          if(!item.url||state.media.some(function(x){return x.url===item.url})){skipped++;return}
          state.media.push(item);added++
        })
      }catch(e){skipped++}
      continue
    }
    var item=parseMediaLine(lines[i]);if(!item){
      if(!/^https?:\/\//i.test(lines[i])){$('mediaAddStatus').textContent='“'+lines[i].slice(0,60)+'” is a search term, not a video URL. Use Discover videos for search terms.'}
      skipped++;continue
    }
    if(state.media.some(function(x){return x.url===item.url})){skipped++;continue}
    if(fetchMeta)item=await fetchMediaMeta(item);
    if(!item.title)item.title=item.url;
    if(!item.matchedTargets.length){skipped++;continue}
    state.media.push(item);added++
  }
  save();$('mediaAddStatus').textContent='Found '+found+' discovery results. Added '+added+' new matching video link'+(added===1?'':'s')+'. Skipped '+skipped+' invalid, duplicate, or non-matching entries.';
  $('mediaImportBtn').disabled=false
}
async function refreshMedia(id){
  var item=state.media.find(function(x){return x.id===id});if(!item)return;
  await fetchMediaMeta(item);save()
}

function renderScriptbin(){
  if(!$('scriptbinGrid'))return;
  var q=$('scriptbinSearchInput').value.trim(),tag=$('scriptbinTagFilter').value||'all',sort=$('scriptbinSortSelect').value||'newest';
  var old=$('scriptbinTagFilter').value||'all';
  var counts={};SCRIPTBIN_TARGETS.forEach(function(t){counts[t]=0});
  state.scriptbin.forEach(function(x){(x.matchedTargets||targetMatches([x.title,x.tags&&x.tags.join(' ')].join(' '))).forEach(function(t){if(counts[t]!=null)counts[t]++})});
  $('scriptbinTagFilter').innerHTML='<option value="all">All target tags</option>'+SCRIPTBIN_TARGETS.map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+' · '+counts[t]+'</option>'}).join('');
  $('scriptbinTagFilter').value=SCRIPTBIN_TARGETS.indexOf(old)>=0?old:'all';tag=$('scriptbinTagFilter').value;
  $('scriptbinTargetChips').innerHTML=SCRIPTBIN_TARGETS.map(function(t){return '<button class="target-chip" type="button" data-scriptbin-chip="'+esc(t)+'"><strong>'+esc(t)+'</strong> · '+counts[t]+'</button>'}).join('');
  var a=state.scriptbin.filter(function(x){
    var mt=x.matchedTargets||targetMatches([x.title,(x.tags||[]).join(' ')].join(' '));x.matchedTargets=mt;
    return (tag==='all'||mt.indexOf(tag)>=0)&&matchesQuery([x.title,x.writer,(x.tags||[]).join(' '),mt.join(' ')],q)
  });
  if(sort==='title')a.sort(function(x,y){return (x.title||'').localeCompare(y.title||'')});
  else if(sort==='writer')a.sort(function(x,y){return (x.writer||'').localeCompare(y.writer||'')||(x.title||'').localeCompare(y.title||'')});
  else a.sort(function(x,y){return (y.createdAt||0)-(x.createdAt||0)});
  $('scriptbinGrid').innerHTML=a.length?a.map(scriptbinCard).join(''):(state.scriptbin.length?'<div class="no-results">No Scriptbin entries match this search.</div>':'');
  $('scriptbinEmpty').hidden=state.scriptbin.length>0;
  $('scriptbinSearchCount').textContent=q||tag!=='all'?'Showing '+a.length+' of '+state.scriptbin.length+' indexed matches':'Showing all '+state.scriptbin.length+' indexed matches';
}
function scriptbinCard(s){
  var mt=(s.matchedTargets||[]).map(function(t){return '<span class="scriptbin-match">'+esc(t)+'</span>'}).join('');
  var tags=(s.tags||[]).filter(function(t){return (s.matchedTargets||[]).indexOf(t)<0}).slice(0,5).map(function(t){return '<span class="tag">['+esc(t)+']</span>'}).join('');
  return '<article class="source-card"><div class="eyebrow">SCRIPTBIN</div><h4>'+esc(s.title||s.url)+'</h4><div class="meta"><span>'+esc(s.writer||'Unknown writer')+'</span></div><div class="tag-row">'+mt+tags+'</div><div class="card-actions"><a class="primary linklike" target="_blank" rel="noopener" href="'+esc(s.url)+'">Open script ↗</a><button class="ghost" data-scriptbin-add="'+s.id+'">Add text</button><button class="danger" data-scriptbin-delete="'+s.id+'">Remove</button></div></article>'
}
function parseScriptbinLine(line){
  var parts=String(line||'').split('|'),url=(parts.shift()||'').trim(),title=parts.join('|').trim();
  if(!/^https?:\/\/(?:www\.)?scriptbin\.works\//i.test(url))return null;
  var path='';
  try{path=new URL(url).pathname.split('/').filter(Boolean);path=path[0]==='u'&&path[1]?path[1]:''}catch(e){}
  var parsed=tagsFrom(title),targets=targetMatches([title,parsed.brackets.join(' ')].join(' '));
  return {id:uid(),url:url,title:title||url,writer:path||'',tags:parsed.brackets||[],matchedTargets:targets,createdAt:Date.now()}
}
function importPastedScriptbin(){
  var lines=$('scriptbinPasteInput').value.split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean),added=0,skipped=0;
  lines.forEach(function(line){
    var item=parseScriptbinLine(line);if(!item){skipped++;return}
    if(state.scriptbin.some(function(x){return x.url===item.url})){skipped++;return}
    if(!item.matchedTargets.length){skipped++;return}
    state.scriptbin.push(item);added++
  });
  $('scriptbinPasteStatus').textContent='Added '+added+' matching entries. Skipped '+skipped+' invalid, duplicate, or non-matching lines.';
  save()
}
async function syncScriptbinSaves(){
  var key=$('scriptbinApiKeyInput').value.trim(),base=normalizeWorker(state.prefs.workerUrl);
  if(!base){$('scriptbinSyncStatus').textContent='Connect your WhisperVault Worker first.';return}
  if(!key){$('scriptbinSyncStatus').textContent='Paste a Scriptbin API access key first.';return}
  $('scriptbinRunSavedSyncBtn').disabled=true;$('scriptbinSyncStatus').textContent='Reading your Scriptbin Saved metadata…';
  try{
    var r=await fetch(base+'/api/scriptbin-saves',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessKey:key,targets:SCRIPTBIN_TARGETS})});
    var d=await r.json();if(!r.ok)throw new Error(d.error||'Scriptbin sync failed');
    var added=0;(d.items||[]).forEach(function(item){
      if(!item.url||state.scriptbin.some(function(x){return x.url===item.url}))return;
      state.scriptbin.push({id:uid(),url:item.url,title:item.title||item.url,writer:item.writer||'',tags:item.tags||tagsFrom(item.title||'').brackets,matchedTargets:item.matchedTargets||targetMatches(item.title||''),createdAt:Date.now()});added++
    });
    save();$('scriptbinSyncStatus').textContent='Found '+(d.count||0)+' matching saved scripts. Added '+added+' new entries.'
  }catch(e){$('scriptbinSyncStatus').textContent='Sync failed: '+e.message}
  finally{$('scriptbinRunSavedSyncBtn').disabled=false}
}
function copyGwasiQuery(){
  var q='('+SCRIPTBIN_TARGETS.map(function(t){return t.indexOf(' ')>=0?'"'+t+'"':t}).join(' OR ')+') type:script';
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(q).then(function(){alert('GWASI discovery query copied. Paste it into gwasi.com search.')} ).catch(function(){prompt('Copy this GWASI query:',q)})}
  else prompt('Copy this GWASI query:',q)
}

function scriptCard(s){
  var tags=(s.tags||[]).slice(0,6).map(function(t){return '<span class="tag">'+esc(t)+'</span>'}).join('');
  return '<article class="card"><div class="eyebrow">'+esc(s.category||'OTHER')+'</div><h4>'+esc(s.title)+'</h4><div class="meta"><span>'+esc(s.author||'Unknown author')+'</span><span>•</span><span>'+words(s.text).toLocaleString()+' words</span></div><div class="tag-row">'+tags+'</div><div class="card-preview">'+esc(s.text)+'</div><div class="card-actions"><button class="primary" data-play-script="'+s.id+'">▶ Listen</button><button class="ghost '+(s.favorite?'fav':'')+'" data-fav-script="'+s.id+'">'+(s.favorite?'★':'☆')+'</button><button class="ghost" data-edit-script="'+s.id+'">Edit</button>'+(s.source?'<a class="ghost linklike" target="_blank" rel="noopener" href="'+esc(s.source)+'">Source ↗</a>':'')+'<button class="danger" data-delete-script="'+s.id+'">Delete</button></div></article>'
}
function sourceCard(s){
  var brackets=sourceBrackets(s),shown=brackets.slice(0,10),tags=shown.map(function(t){return '<span class="tag">['+esc(t)+']</span>'}).join('');
  if(brackets.length>shown.length)tags+='<span class="tag">+'+(brackets.length-shown.length)+' more</span>';
  var eyebrow=brackets.length?(brackets.length+' bracket categor'+(brackets.length===1?'y':'ies')):(s.category||'SOUNDGASM');
  return '<article class="source-card"><div class="eyebrow">'+esc(eyebrow)+'</div><h4>'+esc(s.title||s.url)+'</h4><div class="meta"><span>'+esc(s.author||'Unknown creator')+'</span></div><div class="tag-row">'+tags+'</div><div class="card-actions"><button class="primary" data-play-source="'+s.id+'">▶ Play</button><button class="ghost '+(s.favorite?'fav':'')+'" data-fav-source="'+s.id+'">'+(s.favorite?'★':'☆')+'</button><a class="ghost linklike" target="_blank" rel="noopener" href="'+esc(s.url)+'">Soundgasm ↗</a><button class="ghost" data-use-source="'+s.id+'">Add script</button><button class="danger" data-delete-source="'+s.id+'">Remove</button></div></article>'
}

function resetScriptForm(src){
  editId=null;$('scriptDialogTitle').textContent='Add script';
  $('scriptTitle').value=src?src.title||'':'';$('scriptAuthor').value=src?src.author||'':'';
  $('scriptCategory').value=src&&src.category?src.category:'Other';$('scriptTags').value=src?(src.tags||[]).join(', '):'';
  $('scriptSource').value=src?src.url||'':'';$('scriptPermission').value='unknown';$('scriptText').value=''
}
function editScript(i){
  var s=state.scripts.find(function(x){return x.id===i});if(!s)return;editId=i;
  $('scriptDialogTitle').textContent='Edit script';$('scriptTitle').value=s.title;$('scriptAuthor').value=s.author||'';
  $('scriptCategory').value=s.category||'Other';$('scriptTags').value=(s.tags||[]).join(', ');
  $('scriptSource').value=s.source||'';$('scriptPermission').value=s.permission||'unknown';$('scriptText').value=s.text||'';openD('scriptDialog')
}
function addLinks(){
  var n=0,note=$('sourceNote').value.trim();
  $('sourceUrls').value.split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean).forEach(function(url){
    if(!/^https?:\/\//i.test(url)||state.sources.some(function(s){return s.url===url}))return;
    var sg=soundgasmMeta(url)||{};
    var ttl=note||sg.title||url;state.sources.push({id:uid(),url:url,title:ttl,author:sg.author||'',category:sg.category||'Soundgasm',tags:sg.tags||['Soundgasm'],brackets:bracketCategories(ttl),favorite:false,createdAt:Date.now()});n++
  });
  $('sourceImportSummary').textContent='Added '+n+' new recording link'+(n===1?'':'s')+'.';$('sourceUrls').value='';save()
}
async function loadStarter(){
  var buttons=[$('loadSoundgasmBtn'),$('loadSoundgasmBtn2')].filter(Boolean);
  buttons.forEach(function(b){b.disabled=true});
  try{
    var r=await fetch('./soundgasm-catalog.json?v=2',{cache:'no-store'});if(!r.ok)throw new Error('Catalog unavailable');
    var list=await r.json(),n=0;
    list.forEach(function(item){
      if(!item.url||state.sources.some(function(s){return s.url===item.url}))return;
      var sg=soundgasmMeta(item.url)||{};
      var ttl=item.title||sg.title||item.url;state.sources.push({id:uid(),url:item.url,title:ttl,author:item.author||sg.author||'',category:item.category||sg.category||'Soundgasm',tags:uniq((item.tags||[]).concat(sg.tags||['Soundgasm'])),brackets:item.brackets||bracketCategories(ttl),favorite:false,createdAt:Date.now()});n++
    });save();alert('Added '+n+' starter recording'+(n===1?'':'s')+'.')
  }catch(e){alert('Could not load the starter catalog: '+e.message)}
  finally{buttons.forEach(function(b){b.disabled=false})}
}

function normalizeWorker(v){var s=String(v||'').trim();if(s&&!/^https?:\/\//i.test(s))s='https://'+s;return s.replace(/\/+$/,'')}
function openCreatorDialog(){
  $('workerUrlInput').value=state.prefs.workerUrl||'';$('creatorImportStatus').textContent='Ready.';openD('creatorDialog')
}
async function testWorker(){
  var base=normalizeWorker($('workerUrlInput').value);if(!base){$('creatorImportStatus').textContent='Enter the Worker URL first.';return}
  $('creatorImportStatus').textContent='Testing connection…';
  try{
    var r=await fetch(base+'/health',{cache:'no-store'});var d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||'Connection failed');
    state.prefs.workerUrl=base;save();$('creatorImportStatus').textContent='Connected. Worker v'+(d.version||'?')+' is ready.'
  }catch(e){$('creatorImportStatus').textContent='Connection failed: '+e.message}
}
async function importCreator(){
  var base=normalizeWorker($('workerUrlInput').value),profile=$('creatorProfileInput').value.trim();
  if(!base){$('creatorImportStatus').textContent='Enter your Worker URL first.';return}
  if(!profile){$('creatorImportStatus').textContent='Paste a Soundgasm creator profile first.';return}
  $('runCreatorImportBtn').disabled=true;$('creatorImportStatus').textContent='Reading creator catalog…';
  try{
    var r=await fetch(base+'/api/profile?url='+encodeURIComponent(profile),{cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.error||'Import failed');
    var n=0;
    (d.items||[]).forEach(function(item){
      if(!item.url||state.sources.some(function(s){return s.url===item.url}))return;
      var ttl=item.title||item.url;state.sources.push({id:uid(),url:item.url,title:ttl,author:item.author||d.creator||'',category:item.category||inferCategory(item.title),tags:uniq((item.tags||[]).concat(inferTags(item.title))),brackets:item.brackets||bracketCategories(ttl),favorite:false,createdAt:Date.now()});n++
    });
    state.prefs.workerUrl=base;save();
    $('creatorImportStatus').textContent='Found '+(d.count||0)+' recordings. Added '+n+' new ones.';
  }catch(e){$('creatorImportStatus').textContent='Import failed: '+e.message}
  finally{$('runCreatorImportBtn').disabled=false}
}

async function playSource(i){
  var s=state.sources.find(function(x){return x.id===i});if(!s)return;currentAudioId=i;
  $('audioTitle').textContent=s.title||'Recording';$('audioMeta').textContent=s.author||'';$('audioDescription').textContent=s.description||'';
  $('audioSourceLink').href=s.url;$('audioFavoriteBtn').textContent=s.favorite?'★ Favorited':'☆ Favorite';
  var audio=$('creatorAudio');audio.pause();audio.removeAttribute('src');audio.load();openD('audioDialog');
  if(s.mediaUrl){audio.src=s.mediaUrl;audio.play().catch(function(){});return}
  var base=normalizeWorker(state.prefs.workerUrl);
  if(!base){$('audioDescription').textContent='Connect the WhisperVault Worker to play this recording inside the app. You can still use Open on Soundgasm.';return}
  $('audioDescription').textContent='Loading recording…';
  try{
    var r=await fetch(base+'/api/recording?url='+encodeURIComponent(s.url),{cache:'no-store'}),d=await r.json();
    if(!r.ok)throw new Error(d.error||'Could not load recording');
    s.title=d.title||s.title;s.author=d.creator||s.author;s.description=d.description||'';s.mediaUrl=d.mediaUrl||'';
    s.category=d.category||s.category;s.tags=uniq((s.tags||[]).concat(d.tags||[]));s.brackets=uniq((d.brackets||[]).concat(bracketCategories(s.title||'')));save();
    $('audioTitle').textContent=s.title;$('audioMeta').textContent=s.author||'';$('audioDescription').textContent=s.description||'';
    if(s.mediaUrl){audio.src=s.mediaUrl;audio.play().catch(function(){})}
    else $('audioDescription').textContent=(s.description?s.description+' ':'')+'The direct media URL was not available. Use Open on Soundgasm.'
  }catch(e){$('audioDescription').textContent='Could not play inside WhisperVault: '+e.message}
}
function toggleAudioFavorite(){
  var s=state.sources.find(function(x){return x.id===currentAudioId});if(!s)return;s.favorite=!s.favorite;save();$('audioFavoriteBtn').textContent=s.favorite?'★ Favorited':'☆ Favorite'
}

function voiceList(){return window.speechSynthesis?speechSynthesis.getVoices():[]}
function fillVoices(){
  var v=voiceList(),sel=$('voiceSelect');sel.innerHTML=v.map(function(x,i){return '<option value="'+i+'">'+esc(x.name)+' — '+esc(x.lang)+'</option>'}).join('');
  var fi=v.findIndex(function(x){return x.voiceURI===state.prefs.favoriteVoiceURI});if(fi>=0)sel.value=String(fi);renderVoices()
}
function renderVoices(){
  var q=($('voiceSearch').value||'').toLowerCase();
  $('voiceList').innerHTML=voiceList().filter(function(v){return !q||(v.name+' '+v.lang).toLowerCase().indexOf(q)>=0}).map(function(v){
    return '<div class="voice-row"><div><div class="voice-name">'+esc(v.name)+'</div><div class="voice-lang">'+esc(v.lang)+(v.default?' · device default':'')+'</div></div><button class="ghost compact preview-voice" data-preview-voice="'+esc(v.voiceURI)+'">Preview</button><button class="ghost compact '+(v.voiceURI===state.prefs.favoriteVoiceURI?'fav':'')+'" data-voice-uri="'+esc(v.voiceURI)+'">'+(v.voiceURI===state.prefs.favoriteVoiceURI?'★':'☆')+'</button></div>'
  }).join('')
}
function previewVoice(uri){
  if(!window.speechSynthesis)return;var v=voiceList().find(function(x){return x.voiceURI===uri});var u=new SpeechSynthesisUtterance(($('voicePreviewText').value||'Welcome to WhisperVault.').trim());
  if(v)u.voice=v;u.rate=Number(state.prefs.rate||1);u.pitch=Number(state.prefs.pitch||1);speechSynthesis.cancel();speechSynthesis.speak(u)
}
function splitText(t){var out=[],s=String(t||'').match(/[\s\S]{1,850}(?:\s|$)/g)||[t];s.forEach(function(x){if(x.trim())out.push(x.trim())});return out}
function playScript(i){
  var s=state.scripts.find(function(x){return x.id===i});if(!s)return;stopSpeech();currentScript=s;chunks=splitText(s.text);chunk=0;
  $('playerTitle').textContent=s.title;$('playerMeta').textContent=[s.author,s.category,words(s.text)+' words'].filter(Boolean).join(' · ');$('playerText').textContent=s.text;fillVoices();openD('playerDialog');speakChunk()
}
function speakChunk(){
  if(!currentScript||!chunks.length)return;speechSynthesis.cancel();paused=false;
  var u=new SpeechSynthesisUtterance(chunks[chunk]),v=voiceList(),ix=Number($('voiceSelect').value);
  if(v[ix])u.voice=v[ix];u.rate=Number($('rateRange').value);u.pitch=Number($('pitchRange').value);u.volume=Number($('volumeRange').value);
  u.onend=function(){chunk++;if(chunk<chunks.length)speakChunk();else{chunk=0;$('playPauseBtn').textContent='▶';progress(1)}};
  speechSynthesis.speak(u);$('playPauseBtn').textContent='Ⅱ';progress(chunk/chunks.length)
}
function progress(x){$('progressBar').style.width=Math.round(x*100)+'%';$('progressText').textContent=Math.min(chunk+1,chunks.length)+' of '+(chunks.length||1)+' sections'}
function stopSpeech(){if(window.speechSynthesis)speechSynthesis.cancel();paused=false;if($('playPauseBtn'))$('playPauseBtn').textContent='▶'}

function exportData(){
  var b=new Blob([JSON.stringify({version:6,exportedAt:new Date().toISOString(),scripts:state.scripts,sources:state.sources,scriptbin:state.scriptbin,media:state.media,prefs:state.prefs},null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download='WhisperVault-backup.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},500)
}
async function importData(f){
  try{var x=JSON.parse(await f.text());state={scripts:x.scripts||[],sources:x.sources||[],scriptbin:x.scriptbin||[],media:x.media||[],prefs:Object.assign({},empty.prefs,x.prefs||{})};save();alert('Backup imported.')}
  catch(e){alert('Import failed: '+e.message)}
}

document.addEventListener('click',function(e){
  var b=e.target.closest('button,[data-play-script],[data-edit-script],[data-fav-script],[data-delete-script],[data-play-source],[data-fav-source],[data-use-source],[data-delete-source],[data-scriptbin-add],[data-scriptbin-delete],[data-scriptbin-chip],[data-media-delete],[data-media-refresh],[data-media-chip],[data-voice-uri],[data-preview-voice],[data-close-dialog]');
  if(!b)return;
  if(b.dataset.closeDialog)return closeD(b.dataset.closeDialog);
  if(b.dataset.playScript)return playScript(b.dataset.playScript);
  if(b.dataset.editScript)return editScript(b.dataset.editScript);
  if(b.dataset.favScript){var a=state.scripts.find(function(x){return x.id===b.dataset.favScript});if(a){a.favorite=!a.favorite;save()}return}
  if(b.dataset.deleteScript){if(confirm('Delete this script from this device?')){state.scripts=state.scripts.filter(function(x){return x.id!==b.dataset.deleteScript});save()}return}
  if(b.dataset.playSource)return playSource(b.dataset.playSource);
  if(b.dataset.favSource){var s=state.sources.find(function(x){return x.id===b.dataset.favSource});if(s){s.favorite=!s.favorite;save()}return}
  if(b.dataset.useSource){resetScriptForm(state.sources.find(function(x){return x.id===b.dataset.useSource}));openD('scriptDialog');return}
  if(b.dataset.deleteSource){if(confirm('Remove this recording from your local catalog?')){state.sources=state.sources.filter(function(x){return x.id!==b.dataset.deleteSource});save()}return}
  if(b.dataset.scriptbinAdd){var sb=state.scriptbin.find(function(x){return x.id===b.dataset.scriptbinAdd});if(sb){resetScriptForm({title:sb.title,author:sb.writer,category:'Other',tags:sb.tags||[],url:sb.url});openD('scriptDialog')}return}
  if(b.dataset.scriptbinDelete){state.scriptbin=state.scriptbin.filter(function(x){return x.id!==b.dataset.scriptbinDelete});save();return}
  if(b.dataset.scriptbinChip){$('scriptbinTagFilter').value=b.dataset.scriptbinChip;renderScriptbin();return}
  if(b.dataset.mediaDelete){state.media=state.media.filter(function(x){return x.id!==b.dataset.mediaDelete});save();return}
  if(b.dataset.mediaRefresh){refreshMedia(b.dataset.mediaRefresh);return}
  if(b.dataset.mediaChip){
    var t=b.dataset.mediaChip,cnt=state.media.filter(function(x){return (x.matchedTargets||[]).indexOf(t)>=0}).length;
    if(cnt===0){openMediaDiscover(t);return}
    $('mediaTagFilter').value=t;renderMedia();return
  }
  if(b.dataset.voiceUri){state.prefs.favoriteVoiceURI=b.dataset.voiceUri;save();fillVoices();return}
  if(b.dataset.previewVoice){previewVoice(b.dataset.previewVoice);return}
});

$('scriptForm').addEventListener('submit',function(e){
  e.preventDefault();var now=Date.now(),old=editId?state.scripts.find(function(x){return x.id===editId}):null;
  var item={id:editId||uid(),title:$('scriptTitle').value.trim(),author:$('scriptAuthor').value.trim(),category:$('scriptCategory').value,tags:$('scriptTags').value.split(',').map(function(x){return x.trim()}).filter(Boolean),source:$('scriptSource').value.trim(),permission:$('scriptPermission').value,text:$('scriptText').value.trim(),favorite:old?!!old.favorite:false,createdAt:old?old.createdAt:now,updatedAt:now};
  if(!item.title||!item.text)return;if(old)state.scripts=state.scripts.map(function(x){return x.id===editId?item:x});else state.scripts.push(item);save();closeD('scriptDialog')
});

$('addScriptBtn').onclick=$('emptyAddBtn').onclick=$('navAdd').onclick=function(){resetScriptForm();openD('scriptDialog')};
$('addSourcesBtn').onclick=function(){openD('sourcesDialog')};$('saveSourcesBtn').onclick=addLinks;
$('mediaDiscoverAllBtn').onclick=discoverAllMedia;$('mediaDiscoverBtn').onclick=function(){openMediaDiscover('')};$('mediaDiscoverRunBtn').onclick=discoverMedia;
bindSearchInput('mediaDiscoverQuery',function(){renderMediaSourceLinks($('mediaDiscoverQuery').value)});
$('mediaAddBtn').onclick=function(){openD('mediaAddDialog')};$('mediaImportBtn').onclick=importMediaLinks;
$('scriptbinPasteBtn').onclick=function(){openD('scriptbinPasteDialog')};$('scriptbinImportPastedBtn').onclick=importPastedScriptbin;
$('scriptbinSyncSavedBtn').onclick=function(){openD('scriptbinSavedDialog')};$('scriptbinRunSavedSyncBtn').onclick=syncScriptbinSaves;
$('copyGwasiQueryBtn').onclick=copyGwasiQuery;
$('loadSoundgasmBtn').onclick=$('loadSoundgasmBtn2').onclick=loadStarter;
$('importCreatorBtn').onclick=$('importCreatorBtn2').onclick=$('openCreatorSettingsBtn').onclick=openCreatorDialog;
$('testWorkerBtn').onclick=testWorker;$('runCreatorImportBtn').onclick=importCreator;
$('audioFavoriteBtn').onclick=toggleAudioFavorite;
$('quickVoicesBtn').onclick=$('openVoicesBtn').onclick=$('navVoices').onclick=function(){fillVoices();openD('voicesDialog')};
$('previewDefaultVoiceBtn').onclick=function(){previewVoice(state.prefs.favoriteVoiceURI)};
$('parseTitleBtn').onclick=function(){var p=tagsFrom($('scriptTitle').value);if(p.category)$('scriptCategory').value=p.category;$('scriptTags').value=uniq($('scriptTags').value.split(',').map(function(x){return x.trim()}).filter(Boolean).concat(p.tags)).join(', ')};
$('pasteClipboardBtn').onclick=async function(){try{$('scriptText').value=await navigator.clipboard.readText()}catch(e){alert('Clipboard access was blocked. Tap and hold in the text box and choose Paste.')}};
$('exportBtn').onclick=exportData;$('backupFileInput').onchange=function(e){if(e.target.files[0])importData(e.target.files[0]);e.target.value=''};
$('settingsBtn').onclick=function(){openD('settingsDialog')};$('navSources').onclick=function(){document.querySelector('.source-section').scrollIntoView({behavior:'smooth'})};$('navMedia').onclick=function(){document.querySelector('.media-section').scrollIntoView({behavior:'smooth'})};
$('clearAllBtn').onclick=function(){if(confirm('Delete all WhisperVault local data on this device?')){state=clone(empty);localStorage.removeItem(KEY);localStorage.removeItem(OLD_KEY);save()}};
function bindSearchInput(id,fn){var el=$(id);if(!el)return;['input','search','change','keyup'].forEach(function(evt){el.addEventListener(evt,fn)})}
bindSearchInput('searchInput',renderScripts);$('categoryFilter').addEventListener('change',renderScripts);$('sortSelect').addEventListener('change',renderScripts);
bindSearchInput('sourceSearchInput',renderSources);$('sourceCategoryFilter').addEventListener('change',renderSources);$('sourceSortSelect').addEventListener('change',renderSources);
bindSearchInput('scriptbinSearchInput',renderScriptbin);$('scriptbinTagFilter').addEventListener('change',renderScriptbin);$('scriptbinSortSelect').addEventListener('change',renderScriptbin);
bindSearchInput('mediaSearchInput',renderMedia);$('mediaTagFilter').addEventListener('change',renderMedia);$('mediaSortSelect').addEventListener('change',renderMedia);
$('scriptSearchBtn').onclick=renderScripts;$('scriptClearBtn').onclick=function(){$('searchInput').value='';$('categoryFilter').value='all';renderScripts()};
$('sourceSearchBtn').onclick=renderSources;$('sourceClearBtn').onclick=function(){$('sourceSearchInput').value='';$('sourceCategoryFilter').value='all';renderSources()};
$('scriptbinSearchBtn').onclick=renderScriptbin;$('scriptbinClearBtn').onclick=function(){$('scriptbinSearchInput').value='';$('scriptbinTagFilter').value='all';renderScriptbin()};
$('mediaSearchBtn').onclick=renderMedia;$('mediaClearBtn').onclick=function(){$('mediaSearchInput').value='';$('mediaTagFilter').value='all';renderMedia()};
$('voiceSearch').oninput=renderVoices;
$('rateRange').oninput=function(e){$('rateValue').textContent=Number(e.target.value).toFixed(2)+'×';state.prefs.rate=Number(e.target.value);localStorage.setItem(KEY,JSON.stringify(state))};
$('pitchRange').oninput=function(e){$('pitchValue').textContent=Number(e.target.value).toFixed(2);state.prefs.pitch=Number(e.target.value);localStorage.setItem(KEY,JSON.stringify(state))};
$('volumeRange').oninput=function(e){$('volumeValue').textContent=Math.round(Number(e.target.value)*100)+'%';state.prefs.volume=Number(e.target.value);localStorage.setItem(KEY,JSON.stringify(state))};
$('playPauseBtn').onclick=function(){if(!speechSynthesis.speaking)return speakChunk();if(paused){speechSynthesis.resume();paused=false;$('playPauseBtn').textContent='Ⅱ'}else{speechSynthesis.pause();paused=true;$('playPauseBtn').textContent='▶'}};
$('stopBtn').onclick=function(){stopSpeech();chunk=0;progress(0)};$('rewindBtn').onclick=function(){chunk=Math.max(0,chunk-1);speakChunk()};
$('favoriteVoiceBtn').onclick=function(){var v=voiceList()[Number($('voiceSelect').value)];if(v){state.prefs.favoriteVoiceURI=v.voiceURI;save();fillVoices()}};
$('voiceSelect').onchange=function(){var v=voiceList()[Number(this.value)];if(v)state.prefs.favoriteVoiceURI=v.voiceURI;localStorage.setItem(KEY,JSON.stringify(state))};

document.querySelectorAll('dialog').forEach(function(d){d.addEventListener('close',function(){if(d.id==='playerDialog')stopSpeech();if(d.id==='audioDialog'){var a=$('creatorAudio');a.pause();a.removeAttribute('src');a.load()}})});

if(!localStorage.getItem(AGE)){$('ageGate').hidden=false;$('ageGate').style.display='grid'}else{$('ageGate').hidden=true;$('ageGate').style.display='none'}
$('enterBtn').onclick=function(){localStorage.setItem(AGE,'1');$('ageGate').hidden=true;$('ageGate').style.display='none'};$('leaveBtn').onclick=function(){location.href='about:blank'};

if(window.speechSynthesis){speechSynthesis.onvoiceschanged=fillVoices;setTimeout(fillVoices,200)}
$('rateRange').value=state.prefs.rate||1;$('pitchRange').value=state.prefs.pitch||1;$('volumeRange').value=state.prefs.volume==null?1:state.prefs.volume;
$('rateValue').textContent=Number($('rateRange').value).toFixed(2)+'×';$('pitchValue').textContent=Number($('pitchRange').value).toFixed(2);$('volumeValue').textContent=Math.round(Number($('volumeRange').value)*100)+'%';

if('serviceWorker' in navigator&&location.protocol.indexOf('http')===0)navigator.serviceWorker.register('./sw.js').catch(function(){});
render();
})();