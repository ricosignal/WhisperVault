(function(){
'use strict';

var KEY='whispervault_v4_state', OLD_KEY='whispervault_v3_state', AGE='whispervault_age_ok';
var empty={scripts:[],sources:[],prefs:{favoriteVoiceURI:'',rate:1,pitch:1,volume:1,workerUrl:''}};
var state=load(),editId=null,currentScript=null,chunks=[],chunk=0,paused=false,currentAudioId=null;

function $(id){return document.getElementById(id)}
function clone(x){return JSON.parse(JSON.stringify(x))}
function load(){
  try{
    var raw=localStorage.getItem(KEY)||localStorage.getItem(OLD_KEY)||'{}';
    var x=JSON.parse(raw);
    return {scripts:x.scripts||[],sources:x.sources||[],prefs:Object.assign({},empty.prefs,x.prefs||{})}
  }catch(e){return clone(empty)}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state));render()}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2)}
function openD(id){var d=$(id);if(d&&!d.open)d.showModal()}
function closeD(id){var d=$(id);if(d&&d.open)d.close()}
function words(s){return String(s||'').trim().split(/\s+/).filter(Boolean).length}
function uniq(a){return Array.from(new Set(a.filter(Boolean)))}
function tagsFrom(t){
  var a=[],m,re=/\[([^\]]+)\]/g;
  while((m=re.exec(t||'')))a.push(m[1].trim());
  var c=a.find(function(x){return /^(F4M|M4F|F4F|M4M|F4A|M4A|A4A)$/i.test(x)});
  return {category:c?c.toUpperCase():'',tags:a.filter(function(x){return x!==c}).slice(0,12)}
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
  var creators=uniq(state.sources.map(function(x){return x.author||''})).length;
  var favs=state.sources.filter(function(x){return x.favorite}).length+state.scripts.filter(function(x){return x.favorite}).length;
  $('statsRow').innerHTML=stat('Audio',state.sources.length)+stat('Creators',creators)+stat('Scripts',state.scripts.length)+stat('Favorites',favs);
  $('emptyState').hidden=state.scripts.length>0;
  $('sourceEmpty').hidden=state.sources.length>0;
  if($('workerSettingText'))$('workerSettingText').textContent=state.prefs.workerUrl?state.prefs.workerUrl:'Not connected';
}

function renderScripts(){
  var q=($('searchInput').value||'').trim().toLowerCase(),cat=$('categoryFilter').value||'all',sort=$('sortSelect').value||'newest';
  var cats=uniq(state.scripts.map(function(x){return x.category||''})).sort(),old=$('categoryFilter').value;
  $('categoryFilter').innerHTML='<option value="all">All categories</option>'+cats.map(function(c){return '<option>'+esc(c)+'</option>'}).join('');
  $('categoryFilter').value=cats.indexOf(old)>=0?old:'all';
  var a=state.scripts.filter(function(s){
    var hay=[s.title,s.author,(s.tags||[]).join(' '),s.text].join(' ').toLowerCase();
    return (cat==='all'||s.category===cat)&&(!q||hay.indexOf(q)>=0)
  });
  if(sort==='title')a.sort(function(x,y){return x.title.localeCompare(y.title)});
  else if(sort==='favorites')a.sort(function(x,y){return (y.favorite?1:0)-(x.favorite?1:0)||(y.updatedAt-x.updatedAt)});
  else a.sort(function(x,y){return (y.updatedAt||0)-(x.updatedAt||0)});
  $('libraryGrid').innerHTML=a.map(scriptCard).join('');
}
function renderSources(){
  var q=($('sourceSearchInput').value||'').trim().toLowerCase(),cat=$('sourceCategoryFilter').value||'all',sort=$('sourceSortSelect').value||'newest';
  var cats=uniq(state.sources.map(function(x){return x.category||'Soundgasm'})).sort(),old=$('sourceCategoryFilter').value;
  $('sourceCategoryFilter').innerHTML='<option value="all">All categories</option>'+cats.map(function(c){return '<option>'+esc(c)+'</option>'}).join('');
  $('sourceCategoryFilter').value=cats.indexOf(old)>=0?old:'all';
  var a=state.sources.filter(function(s){
    var hay=[s.title,s.author,s.category,(s.tags||[]).join(' ')].join(' ').toLowerCase();
    return (cat==='all'||(s.category||'Soundgasm')===cat)&&(!q||hay.indexOf(q)>=0)
  });
  if(sort==='title')a.sort(function(x,y){return (x.title||'').localeCompare(y.title||'')});
  else if(sort==='creator')a.sort(function(x,y){return (x.author||'').localeCompare(y.author||'')||(x.title||'').localeCompare(y.title||'')});
  else a.sort(function(x,y){return (y.createdAt||0)-(x.createdAt||0)});
  $('sourceGrid').innerHTML=a.map(sourceCard).join('');
}
function scriptCard(s){
  var tags=(s.tags||[]).slice(0,6).map(function(t){return '<span class="tag">'+esc(t)+'</span>'}).join('');
  return '<article class="card"><div class="eyebrow">'+esc(s.category||'OTHER')+'</div><h4>'+esc(s.title)+'</h4><div class="meta"><span>'+esc(s.author||'Unknown author')+'</span><span>•</span><span>'+words(s.text).toLocaleString()+' words</span></div><div class="tag-row">'+tags+'</div><div class="card-preview">'+esc(s.text)+'</div><div class="card-actions"><button class="primary" data-play-script="'+s.id+'">▶ Listen</button><button class="ghost '+(s.favorite?'fav':'')+'" data-fav-script="'+s.id+'">'+(s.favorite?'★':'☆')+'</button><button class="ghost" data-edit-script="'+s.id+'">Edit</button>'+(s.source?'<a class="ghost linklike" target="_blank" rel="noopener" href="'+esc(s.source)+'">Source ↗</a>':'')+'<button class="danger" data-delete-script="'+s.id+'">Delete</button></div></article>'
}
function sourceCard(s){
  var tags=(s.tags||[]).slice(0,6).map(function(t){return '<span class="tag">'+esc(t)+'</span>'}).join('');
  return '<article class="source-card"><div class="eyebrow">'+esc(s.category||'SOUNDGASM')+'</div><h4>'+esc(s.title||s.url)+'</h4><div class="meta"><span>'+esc(s.author||'Unknown creator')+'</span></div><div class="tag-row">'+tags+'</div><div class="card-actions"><button class="primary" data-play-source="'+s.id+'">▶ Play</button><button class="ghost '+(s.favorite?'fav':'')+'" data-fav-source="'+s.id+'">'+(s.favorite?'★':'☆')+'</button><a class="ghost linklike" target="_blank" rel="noopener" href="'+esc(s.url)+'">Soundgasm ↗</a><button class="ghost" data-use-source="'+s.id+'">Add script</button><button class="danger" data-delete-source="'+s.id+'">Remove</button></div></article>'
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
    state.sources.push({id:uid(),url:url,title:note||sg.title||url,author:sg.author||'',category:sg.category||'Soundgasm',tags:sg.tags||['Soundgasm'],favorite:false,createdAt:Date.now()});n++
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
      state.sources.push({id:uid(),url:item.url,title:item.title||sg.title||item.url,author:item.author||sg.author||'',category:item.category||sg.category||'Soundgasm',tags:uniq((item.tags||[]).concat(sg.tags||['Soundgasm'])),favorite:false,createdAt:Date.now()});n++
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
    state.prefs.workerUrl=base;save();$('creatorImportStatus').textContent='Connected. Worker is ready.'
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
      state.sources.push({id:uid(),url:item.url,title:item.title||item.url,author:item.author||d.creator||'',category:item.category||inferCategory(item.title),tags:uniq((item.tags||[]).concat(inferTags(item.title))),favorite:false,createdAt:Date.now()});n++
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
    s.category=d.category||s.category;s.tags=uniq((s.tags||[]).concat(d.tags||[]));save();
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
  var b=new Blob([JSON.stringify({version:4,exportedAt:new Date().toISOString(),scripts:state.scripts,sources:state.sources,prefs:state.prefs},null,2)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download='WhisperVault-backup.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},500)
}
async function importData(f){
  try{var x=JSON.parse(await f.text());state={scripts:x.scripts||[],sources:x.sources||[],prefs:Object.assign({},empty.prefs,x.prefs||{})};save();alert('Backup imported.')}
  catch(e){alert('Import failed: '+e.message)}
}

document.addEventListener('click',function(e){
  var b=e.target.closest('button,[data-play-script],[data-edit-script],[data-fav-script],[data-delete-script],[data-play-source],[data-fav-source],[data-use-source],[data-delete-source],[data-voice-uri],[data-preview-voice],[data-close-dialog]');
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
$('loadSoundgasmBtn').onclick=$('loadSoundgasmBtn2').onclick=loadStarter;
$('importCreatorBtn').onclick=$('importCreatorBtn2').onclick=$('openCreatorSettingsBtn').onclick=openCreatorDialog;
$('testWorkerBtn').onclick=testWorker;$('runCreatorImportBtn').onclick=importCreator;
$('audioFavoriteBtn').onclick=toggleAudioFavorite;
$('quickVoicesBtn').onclick=$('openVoicesBtn').onclick=$('navVoices').onclick=function(){fillVoices();openD('voicesDialog')};
$('previewDefaultVoiceBtn').onclick=function(){previewVoice(state.prefs.favoriteVoiceURI)};
$('parseTitleBtn').onclick=function(){var p=tagsFrom($('scriptTitle').value);if(p.category)$('scriptCategory').value=p.category;$('scriptTags').value=uniq($('scriptTags').value.split(',').map(function(x){return x.trim()}).filter(Boolean).concat(p.tags)).join(', ')};
$('pasteClipboardBtn').onclick=async function(){try{$('scriptText').value=await navigator.clipboard.readText()}catch(e){alert('Clipboard access was blocked. Tap and hold in the text box and choose Paste.')}};
$('exportBtn').onclick=exportData;$('backupFileInput').onchange=function(e){if(e.target.files[0])importData(e.target.files[0]);e.target.value=''};
$('settingsBtn').onclick=function(){openD('settingsDialog')};$('navSources').onclick=function(){document.querySelector('.source-section').scrollIntoView({behavior:'smooth'})};
$('clearAllBtn').onclick=function(){if(confirm('Delete all WhisperVault local data on this device?')){state=clone(empty);localStorage.removeItem(KEY);localStorage.removeItem(OLD_KEY);save()}};
$('searchInput').oninput=renderScripts;$('categoryFilter').onchange=renderScripts;$('sortSelect').onchange=renderScripts;
$('sourceSearchInput').oninput=renderSources;$('sourceCategoryFilter').onchange=renderSources;$('sourceSortSelect').onchange=renderSources;
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