const http = require('http');
const { WebSocketServer } = require('ws');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ── State ────────────────────────────────────────────────────────────
let state = {
  workers: [
    { id: 1, name: 'Mike Torres', role: 'PTF Upgrade' },
    { id: 2, name: 'Sara Chen',   role: 'OS Upgrade'  },
    { id: 3, name: 'James Ward',  role: 'PTF Upgrade' },
    { id: 4, name: 'Priya Patel', role: 'OS Upgrade'  },
    { id: 5, name: 'Dan Kim',     role: 'PTF Upgrade' },
  ],
  nextId: 6,
  assignments: {},
};

const STATE_FILE = path.join(__dirname, 'state.json');
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
}
function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
}

// ── Embedded HTML ────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Maintenance Scheduler</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg-primary: #ffffff; --bg-secondary: #f5f5f3; --bg-info: #e6f1fb;
    --bg-success: #e1f5ee; --bg-danger: #fcebeb;
    --text-primary: #1a1a18; --text-secondary: #6b6b68; --text-tertiary: #9b9b97;
    --text-info: #185fa5; --text-success: #085041; --text-danger: #a32d2d;
    --border-tertiary: rgba(0,0,0,0.12); --border-secondary: rgba(0,0,0,0.22);
    --border-info: #378add; --radius-md: 8px; --radius-lg: 12px;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg-primary: #1e1e1c; --bg-secondary: #2a2a28; --bg-info: #0c2a44;
      --bg-success: #04342c; --bg-danger: #3a1010;
      --text-primary: #f0f0ed; --text-secondary: #a0a09c; --text-tertiary: #6b6b68;
      --text-info: #85b7eb; --text-success: #5dcaa5; --text-danger: #f09595;
      --border-tertiary: rgba(255,255,255,0.1); --border-secondary: rgba(255,255,255,0.2);
    }
  }
  body { font-family: var(--font); background: var(--bg-secondary); color: var(--text-primary); min-height: 100vh; padding: 24px 20px; }
  .app { max-width: 980px; margin: 0 auto; }
  .top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .app-title { font-size: 20px; font-weight: 600; }
  .top-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .week-nav { display: flex; align-items: center; gap: 8px; }
  .nav-btn { background: var(--bg-primary); border: 0.5px solid var(--border-secondary); border-radius: var(--radius-md); padding: 6px 12px; cursor: pointer; font-size: 14px; color: var(--text-secondary); font-family: var(--font); transition: background 0.15s; }
  .nav-btn:hover { background: var(--bg-secondary); }
  .week-label { font-size: 13px; font-weight: 500; min-width: 140px; text-align: center; }
  .status-badge { font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 99px; border: 0.5px solid; display: flex; align-items: center; gap: 5px; }
  .status-badge.connected    { background: var(--bg-success); color: var(--text-success); border-color: #1d9e75; }
  .status-badge.disconnected { background: var(--bg-danger);  color: var(--text-danger);  border-color: #e24b4a; }
  .status-badge.connecting   { background: var(--bg-info);    color: var(--text-info);    border-color: var(--border-info); }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .online-count { font-size: 11px; color: var(--text-tertiary); padding: 4px 10px; border: 0.5px solid var(--border-tertiary); border-radius: 99px; background: var(--bg-primary); }
  .layout { display: grid; grid-template-columns: 170px 1fr; gap: 16px; align-items: start; }
  @media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
  .sidebar { background: var(--bg-primary); border: 0.5px solid var(--border-tertiary); border-radius: var(--radius-lg); padding: 14px; display: flex; flex-direction: column; gap: 6px; position: sticky; top: 24px; }
  .sidebar-label { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .worker-block { padding: 8px 10px; border-radius: var(--radius-md); border: 0.5px solid; cursor: grab; user-select: none; font-size: 13px; font-weight: 500; transition: opacity 0.15s, transform 0.1s; display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; }
  .worker-block:active { cursor: grabbing; transform: scale(0.97); }
  .worker-block.dragging { opacity: 0.35; }
  .worker-info { flex: 1; min-width: 0; }
  .worker-block .role { font-size: 11px; font-weight: 400; margin-top: 2px; opacity: 0.75; }
  .worker-delete { background: none; border: none; cursor: pointer; font-size: 14px; color: inherit; opacity: 0.3; padding: 0; line-height: 1; flex-shrink: 0; margin-top: 1px; transition: opacity 0.1s; }
  .worker-delete:hover { opacity: 0.85; }
  .divider { height: 0.5px; background: var(--border-tertiary); margin: 4px 0; }
  .add-section { display: flex; flex-direction: column; gap: 6px; }
  .add-section input, .add-section select { width: 100%; font-size: 12px; padding: 6px 8px; border: 0.5px solid var(--border-secondary); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary); font-family: var(--font); outline: none; }
  .add-section input:focus, .add-section select:focus { border-color: var(--border-info); box-shadow: 0 0 0 2px rgba(55,138,221,0.15); }
  .add-btn { width: 100%; font-size: 12px; padding: 6px 8px; border: 0.5px solid var(--border-secondary); border-radius: var(--radius-md); background: transparent; cursor: pointer; color: var(--text-primary); font-family: var(--font); transition: background 0.15s; }
  .add-btn:hover { background: var(--bg-secondary); }
  .calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  @media (max-width: 640px) { .calendar { grid-template-columns: repeat(4, 1fr); } }
  .day-col { display: flex; flex-direction: column; gap: 4px; }
  .day-header { text-align: center; padding: 4px 2px 6px; }
  .day-name { font-size: 11px; font-weight: 500; color: var(--text-secondary); display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .day-num { font-size: 15px; font-weight: 500; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin: 0 auto; border-radius: 50%; color: var(--text-primary); }
  .day-num.today { background: var(--bg-info); color: var(--text-info); }
  .drop-zone { min-height: 90px; background: var(--bg-primary); border: 0.5px solid var(--border-tertiary); border-radius: var(--radius-md); padding: 4px; display: flex; flex-direction: column; gap: 3px; transition: border-color 0.15s, background 0.15s; }
  .drop-zone.weekend { background: var(--bg-secondary); opacity: 0.7; }
  .drop-zone.drag-over { border-color: var(--border-info); background: var(--bg-info); }
  .assignment { padding: 5px 6px; border-radius: 6px; border: 0.5px solid; font-size: 11px; font-weight: 500; display: flex; align-items: center; justify-content: space-between; cursor: grab; gap: 2px; }
  .assignment:active { cursor: grabbing; }
  .assignment .a-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .remove-btn { background: none; border: none; cursor: pointer; font-size: 14px; color: inherit; opacity: 0.4; padding: 0; line-height: 1; flex-shrink: 0; transition: opacity 0.1s; }
  .remove-btn:hover { opacity: 1; }
  .count-badge { font-size: 10px; color: var(--text-tertiary); text-align: center; padding: 2px 0 0; }
</style>
</head>
<body>
<div class="app">
  <div class="top-bar">
    <span class="app-title">&#128296; Maintenance Scheduler</span>
    <div class="top-right">
      <span class="online-count" id="online-count">&#9679; 1 online</span>
      <div class="status-badge connecting" id="status-badge">
        <span class="status-dot"></span>
        <span id="status-text">Connecting&#8230;</span>
      </div>
      <div class="week-nav">
        <button class="nav-btn" id="prev-week">&#8592;</button>
        <span class="week-label" id="week-label"></span>
        <button class="nav-btn" id="next-week">&#8594;</button>
      </div>
    </div>
  </div>
  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-label">Workers</div>
      <div id="worker-list"></div>
      <div class="divider"></div>
      <div class="add-section">
        <input id="new-name" placeholder="Worker name" maxlength="20" />
        <select id="new-role">
          <option value="PTF Upgrade">PTF Upgrade</option>
          <option value="OS Upgrade">OS Upgrade</option>
        </select>
        <button class="add-btn" id="add-btn">+ Add Worker</button>
      </div>
    </div>
    <div class="calendar" id="calendar"></div>
  </div>
</div>
<script>
const CL = [
  {bg:'#E6F1FB',border:'#378ADD',text:'#0C447C'},
  {bg:'#E1F5EE',border:'#1D9E75',text:'#085041'},
  {bg:'#FAEEDA',border:'#BA7517',text:'#633806'},
  {bg:'#FBEAF0',border:'#D4537E',text:'#72243E'},
  {bg:'#EEEDFE',border:'#7F77DD',text:'#3C3489'},
  {bg:'#FAECE7',border:'#D85A30',text:'#712B13'},
  {bg:'#EAF3DE',border:'#639922',text:'#27500A'},
];
const CD = [
  {bg:'#0c2a44',border:'#378ADD',text:'#85b7eb'},
  {bg:'#04342c',border:'#1D9E75',text:'#5dcaa5'},
  {bg:'#412402',border:'#BA7517',text:'#fac775'},
  {bg:'#4b1528',border:'#D4537E',text:'#ed93b1'},
  {bg:'#26215c',border:'#7F77DD',text:'#afa9ec'},
  {bg:'#4a1b0c',border:'#D85A30',text:'#f0997b'},
  {bg:'#173404',border:'#639922',text:'#97c459'},
];
const ROLE_ICONS = {'PTF Upgrade':'PTF','OS Upgrade':'OS'};
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
let workers=[],assignments={},weekOffset=0,dragPayload=null,ws=null,reconnectTimer=null;
const isDark=()=>window.matchMedia('(prefers-color-scheme: dark)').matches;
function getColor(id){const idx=workers.findIndex(w=>w.id===id);const p=isDark()?CD:CL;return p[(idx>=0?idx:id)%p.length];}
function getWeekDates(off){const now=new Date(),day=now.getDay(),mon=new Date(now);mon.setDate(now.getDate()-(day===0?6:day-1)+off*7);return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});}
function dateKey(d){return d.toISOString().slice(0,10);}
const todayKey=dateKey(new Date());
function setStatus(s){document.getElementById('status-badge').className='status-badge '+s;document.getElementById('status-text').textContent={connected:'Live',disconnected:'Offline',connecting:'Connecting\u2026'}[s];}
function getWsUrl(){return(location.protocol==='https:'?'wss:':'ws:')+'//'+ location.host;}
function send(obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function connect(){if(ws){ws.onclose=null;ws.close();}setStatus('connecting');ws=new WebSocket(getWsUrl());ws.onopen=()=>{setStatus('connected');clearTimeout(reconnectTimer);};ws.onmessage=({data})=>{let m;try{m=JSON.parse(data);}catch{return;}handle(m);};ws.onclose=()=>{setStatus('disconnected');reconnectTimer=setTimeout(connect,3000);};ws.onerror=()=>setStatus('disconnected');}
function handle(msg){
  switch(msg.type){
    case 'init':workers=msg.payload.workers;assignments=msg.payload.assignments;renderWorkers();renderCalendar();break;
    case 'online_count':document.getElementById('online-count').textContent='\u25cf '+msg.count+' online';break;
    case 'add_worker':if(!workers.find(w=>w.id===msg.worker.id))workers.push(msg.worker);renderWorkers();renderCalendar();break;
    case 'remove_worker':workers=workers.filter(w=>w.id!==msg.workerId);Object.keys(assignments).forEach(d=>{assignments[d]=assignments[d].filter(id=>id!==msg.workerId);});renderWorkers();renderCalendar();break;
    case 'assign':if(msg.fromDate&&msg.fromDate!==msg.toDate)assignments[msg.fromDate]=(assignments[msg.fromDate]||[]).filter(id=>id!==msg.workerId);if(!assignments[msg.toDate])assignments[msg.toDate]=[];if(!assignments[msg.toDate].includes(msg.workerId))assignments[msg.toDate].push(msg.workerId);renderCalendar();break;
    case 'unassign':assignments[msg.date]=(assignments[msg.date]||[]).filter(id=>id!==msg.workerId);renderCalendar();break;
  }
}
function renderWorkers(){
  const list=document.getElementById('worker-list');list.innerHTML='';
  workers.forEach(w=>{
    const c=getColor(w.id),el=document.createElement('div');
    el.className='worker-block';el.draggable=true;
    el.style.cssText='background:'+c.bg+';border-color:'+c.border+';color:'+c.text;
    el.innerHTML='<div class="worker-info">'+w.name+'<div class="role">'+w.role+'</div></div><button class="worker-delete" data-wid="'+w.id+'">\u00d7</button>';
    el.addEventListener('dragstart',e=>{dragPayload={workerId:w.id,fromDate:null};setTimeout(()=>el.classList.add('dragging'),0);e.dataTransfer.effectAllowed='move';});
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    list.appendChild(el);
  });
  list.querySelectorAll('.worker-delete').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();const wid=parseInt(btn.dataset.wid);if(!confirm('Remove '+(workers.find(w=>w.id===wid)||{}).name+'?'))return;send({type:'remove_worker',workerId:wid});});
  });
}
function renderCalendar(){
  const days=getWeekDates(weekOffset),cal=document.getElementById('calendar');cal.innerHTML='';
  days.forEach((d,i)=>{
    const key=dateKey(d),isWeekend=i>=5;
    const col=document.createElement('div');col.className='day-col';
    const hdr=document.createElement('div');hdr.className='day-header';
    const numEl=document.createElement('span');numEl.className='day-num'+(key===todayKey?' today':'');numEl.textContent=d.getDate();
    hdr.innerHTML='<span class="day-name">'+DAY_NAMES[i]+'</span>';hdr.appendChild(numEl);col.appendChild(hdr);
    const zone=document.createElement('div');zone.className='drop-zone'+(isWeekend?' weekend':'');zone.dataset.date=key;
    (assignments[key]||[]).forEach(wid=>{
      const w=workers.find(x=>x.id===wid);if(!w)return;
      const c=getColor(wid),card=document.createElement('div');
      card.className='assignment';card.draggable=true;
      card.style.cssText='background:'+c.bg+';border-color:'+c.border+';color:'+c.text;
      card.innerHTML='<span class="a-name">'+w.name+'</span><button class="remove-btn" data-wid="'+wid+'" data-date="'+key+'">\u00d7</button>';
      card.addEventListener('dragstart',e=>{dragPayload={workerId:wid,fromDate:key};e.dataTransfer.effectAllowed='move';});
      zone.appendChild(card);
    });
    const cnt=(assignments[key]||[]).length;
    if(cnt>0){const b=document.createElement('div');b.className='count-badge';b.textContent=cnt===1?'1 assigned':cnt+' assigned';zone.appendChild(b);}
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag-over');});
    zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drag-over');});
    zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag-over');if(!dragPayload)return;const{workerId,fromDate}=dragPayload;dragPayload=null;send({type:'assign',workerId,toDate:key,fromDate:fromDate||null});});
    col.appendChild(zone);cal.appendChild(col);
  });
  document.querySelectorAll('.remove-btn').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();send({type:'unassign',workerId:parseInt(btn.dataset.wid),date:btn.dataset.date});});});
}
function updateWeekLabel(){const days=getWeekDates(weekOffset),opts={month:'short',day:'numeric'};document.getElementById('week-label').textContent=days[0].toLocaleDateString('en-US',opts)+' \u2013 '+days[6].toLocaleDateString('en-US',opts);}
document.getElementById('prev-week').addEventListener('click',()=>{weekOffset--;updateWeekLabel();renderCalendar();});
document.getElementById('next-week').addEventListener('click',()=>{weekOffset++;updateWeekLabel();renderCalendar();});
document.getElementById('add-btn').addEventListener('click',()=>{const nameEl=document.getElementById('new-name'),name=nameEl.value.trim();if(!name){nameEl.focus();return;}send({type:'add_worker',name,role:document.getElementById('new-role').value});nameEl.value='';});
document.getElementById('new-name').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('add-btn').click();});
updateWeekLabel();connect();
</script>
</body>
</html>`;

// ── HTTP ─────────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

// ── WebSocket ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

function broadcast(msg, exclude) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1 && c !== exclude) c.send(data); });
}
function broadcastCount() {
  const d = JSON.stringify({ type: 'online_count', count: wss.clients.size });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(d); });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'init', payload: state }));
  broadcastCount();
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'add_worker': {
        const worker = { id: state.nextId++, name: msg.name, role: msg.role };
        state.workers.push(worker); saveState();
        const out = { type: 'add_worker', worker };
        ws.send(JSON.stringify(out)); broadcast(out, ws); break;
      }
      case 'remove_worker': {
        state.workers = state.workers.filter(w => w.id !== msg.workerId);
        Object.keys(state.assignments).forEach(d => {
          state.assignments[d] = state.assignments[d].filter(id => id !== msg.workerId);
        });
        saveState();
        const out = { type: 'remove_worker', workerId: msg.workerId };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'assign': {
        if (msg.fromDate && msg.fromDate !== msg.toDate)
          state.assignments[msg.fromDate] = (state.assignments[msg.fromDate] || []).filter(id => id !== msg.workerId);
        if (!state.assignments[msg.toDate]) state.assignments[msg.toDate] = [];
        if (!state.assignments[msg.toDate].includes(msg.workerId)) state.assignments[msg.toDate].push(msg.workerId);
        saveState();
        const out = { type: 'assign', workerId: msg.workerId, toDate: msg.toDate, fromDate: msg.fromDate || null };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'unassign': {
        state.assignments[msg.date] = (state.assignments[msg.date] || []).filter(id => id !== msg.workerId);
        saveState();
        const out = { type: 'unassign', workerId: msg.workerId, date: msg.date };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
    }
  });
  ws.on('close', () => broadcastCount());
});

httpServer.listen(PORT, () => console.log('Server running on port ' + PORT));
