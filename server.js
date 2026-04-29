const http = require('http');
const { WebSocketServer } = require('ws');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

let state = {
  workers: [
    { id: 1, name: 'Mike Torres', role: 'PTF Upgrade' },
    { id: 2, name: 'Sara Chen',   role: 'OS Upgrade'  },
    { id: 3, name: 'James Ward',  role: 'PTF Upgrade' },
    { id: 4, name: 'Priya Patel', role: 'OS Upgrade'  },
    { id: 5, name: 'Dan Kim',     role: 'PTF Upgrade' },
  ],
  nextId: 6,
  // assignments: { "2025-05-01|08:00": [1, 3], ... }
  assignments: {},
};

const STATE_FILE = path.join(__dirname, 'state.json');
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
}
function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Maintenance Scheduler</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#f5f5f3;--bg1:#fff;--bg2:#f5f5f3;--bg3:#eeecea;
  --bg-info:#e6f1fb;--bg-success:#e1f5ee;--bg-danger:#fcebeb;
  --tx:#1a1a18;--tx2:#6b6b68;--tx3:#9b9b97;
  --tx-info:#185fa5;--tx-success:#085041;--tx-danger:#a32d2d;
  --bd:rgba(0,0,0,0.12);--bd2:rgba(0,0,0,0.22);--bd-info:#378add;
  --r:8px;--r2:12px;
  --font:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --slot-h:36px;
  --time-col:52px;
  --day-col:120px;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#1a1a18;--bg1:#1e1e1c;--bg2:#2a2a28;--bg3:#333330;
  --bg-info:#0c2a44;--bg-success:#04342c;--bg-danger:#3a1010;
  --tx:#f0f0ed;--tx2:#a0a09c;--tx3:#6b6b68;
  --tx-info:#85b7eb;--tx-success:#5dcaa5;--tx-danger:#f09595;
  --bd:rgba(255,255,255,0.1);--bd2:rgba(255,255,255,0.2);
}}
body{font-family:var(--font);background:var(--bg);color:var(--tx);min-height:100vh;padding:16px;}
.app{max-width:1100px;margin:0 auto;}

/* top bar */
.top-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;}
.app-title{font-size:18px;font-weight:600;}
.top-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.week-nav{display:flex;align-items:center;gap:6px;}
.nav-btn{background:var(--bg1);border:0.5px solid var(--bd2);border-radius:var(--r);padding:5px 10px;cursor:pointer;font-size:13px;color:var(--tx2);font-family:var(--font);}
.nav-btn:hover{background:var(--bg2);}
.week-label{font-size:12px;font-weight:500;min-width:130px;text-align:center;}
.status-badge{font-size:11px;font-weight:500;padding:3px 9px;border-radius:99px;border:0.5px solid;display:flex;align-items:center;gap:4px;}
.status-badge.connected{background:var(--bg-success);color:var(--tx-success);border-color:#1d9e75;}
.status-badge.disconnected{background:var(--bg-danger);color:var(--tx-danger);border-color:#e24b4a;}
.status-badge.connecting{background:var(--bg-info);color:var(--tx-info);border-color:var(--bd-info);}
.status-dot{width:6px;height:6px;border-radius:50%;background:currentColor;}
.online-count{font-size:11px;color:var(--tx3);padding:3px 9px;border:0.5px solid var(--bd);border-radius:99px;background:var(--bg1);}

/* layout */
.layout{display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:start;}
@media(max-width:600px){.layout{grid-template-columns:1fr;}}

/* sidebar */
.sidebar{background:var(--bg1);border:0.5px solid var(--bd);border-radius:var(--r2);padding:12px;display:flex;flex-direction:column;gap:5px;position:sticky;top:16px;}
.sidebar-label{font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;}
.worker-block{padding:7px 9px;border-radius:var(--r);border:0.5px solid;cursor:grab;user-select:none;font-size:12px;font-weight:500;display:flex;align-items:flex-start;justify-content:space-between;gap:3px;}
.worker-block:active{cursor:grabbing;transform:scale(.97);}
.worker-block.dragging{opacity:.35;}
.worker-info{flex:1;min-width:0;}
.worker-block .role{font-size:10px;font-weight:400;margin-top:2px;opacity:.7;}
.worker-delete{background:none;border:none;cursor:pointer;font-size:13px;color:inherit;opacity:.3;padding:0;line-height:1;flex-shrink:0;transition:opacity .1s;}
.worker-delete:hover{opacity:.9;}
.divider{height:.5px;background:var(--bd);margin:4px 0;}
.add-section{display:flex;flex-direction:column;gap:5px;}
.add-section input,.add-section select{width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--bd2);border-radius:var(--r);background:var(--bg2);color:var(--tx);font-family:var(--font);outline:none;}
.add-section input:focus,.add-section select:focus{border-color:var(--bd-info);box-shadow:0 0 0 2px rgba(55,138,221,.15);}
.add-btn{width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--bd2);border-radius:var(--r);background:transparent;cursor:pointer;color:var(--tx);font-family:var(--font);}
.add-btn:hover{background:var(--bg2);}

/* calendar grid */
.cal-wrapper{overflow-x:auto;}
.cal-grid{display:grid;grid-template-columns:var(--time-col) repeat(7, var(--day-col));min-width:calc(var(--time-col) + 7 * var(--day-col));}

/* day headers */
.cal-header{display:contents;}
.corner{background:var(--bg2);border-bottom:0.5px solid var(--bd);border-right:0.5px solid var(--bd);position:sticky;left:0;z-index:3;}
.day-hdr{background:var(--bg1);border-bottom:0.5px solid var(--bd);border-right:0.5px solid var(--bd);padding:6px 4px;text-align:center;}
.day-hdr .dname{font-size:10px;font-weight:500;color:var(--tx2);text-transform:uppercase;letter-spacing:.04em;}
.day-hdr .dnum{font-size:14px;font-weight:500;color:var(--tx);width:24px;height:24px;display:flex;align-items:center;justify-content:center;margin:2px auto 0;border-radius:50%;}
.day-hdr .dnum.today{background:var(--bg-info);color:var(--tx-info);}

/* time rows */
.time-row{display:contents;}
.time-label{background:var(--bg2);border-right:0.5px solid var(--bd);border-bottom:0.5px solid var(--bd);padding:0 6px;display:flex;align-items:center;justify-content:flex-end;font-size:10px;color:var(--tx3);height:var(--slot-h);position:sticky;left:0;z-index:2;white-space:nowrap;}
.time-label.hour{border-top:0.5px solid var(--bd2);color:var(--tx2);font-weight:500;}

/* slots */
.slot{height:var(--slot-h);border-right:0.5px solid var(--bd);border-bottom:0.5px solid var(--bd);padding:2px;display:flex;flex-direction:column;gap:1px;position:relative;transition:background .1s;}
.slot.hour-top{border-top:0.5px solid var(--bd2);}
.slot.weekend{background:var(--bg2);}
.slot.drag-over{background:var(--bg-info);border-color:var(--bd-info);}

/* assignment chips */
.chip{border-radius:4px;border:0.5px solid;font-size:10px;font-weight:500;padding:1px 4px;display:flex;align-items:center;justify-content:space-between;gap:2px;cursor:grab;overflow:hidden;flex-shrink:0;}
.chip:active{cursor:grabbing;}
.chip .chip-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}
.chip-remove{background:none;border:none;cursor:pointer;font-size:11px;color:inherit;opacity:.4;padding:0;line-height:1;flex-shrink:0;}
.chip-remove:hover{opacity:1;}
</style>
</head>
<body>
<div class="app">
  <div class="top-bar">
    <span class="app-title">&#128296; Maintenance Scheduler</span>
    <div class="top-right">
      <span class="online-count" id="online-count">&#9679; 1 online</span>
      <div class="status-badge connecting" id="status-badge">
        <span class="status-dot"></span><span id="status-text">Connecting&#8230;</span>
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
        <input id="new-name" placeholder="Worker name" maxlength="20"/>
        <select id="new-role">
          <option value="PTF Upgrade">PTF Upgrade</option>
          <option value="OS Upgrade">OS Upgrade</option>
        </select>
        <button class="add-btn" id="add-btn">+ Add Worker</button>
      </div>
    </div>

    <div class="cal-wrapper">
      <div class="cal-grid" id="cal-grid"></div>
    </div>
  </div>
</div>

<script>
const CL=[
  {bg:'#E6F1FB',border:'#378ADD',text:'#0C447C'},
  {bg:'#E1F5EE',border:'#1D9E75',text:'#085041'},
  {bg:'#FAEEDA',border:'#BA7517',text:'#633806'},
  {bg:'#FBEAF0',border:'#D4537E',text:'#72243E'},
  {bg:'#EEEDFE',border:'#7F77DD',text:'#3C3489'},
  {bg:'#FAECE7',border:'#D85A30',text:'#712B13'},
  {bg:'#EAF3DE',border:'#639922',text:'#27500A'},
];
const CD=[
  {bg:'#0c2a44',border:'#378ADD',text:'#85b7eb'},
  {bg:'#04342c',border:'#1D9E75',text:'#5dcaa5'},
  {bg:'#412402',border:'#BA7517',text:'#fac775'},
  {bg:'#4b1528',border:'#D4537E',text:'#ed93b1'},
  {bg:'#26215c',border:'#7F77DD',text:'#afa9ec'},
  {bg:'#4a1b0c',border:'#D85A30',text:'#f0997b'},
  {bg:'#173404',border:'#639922',text:'#97c459'},
];
const DAY_NAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// 8:00 to 22:00, 30-min slots => 28 slots
const SLOTS=[];
for(let h=8;h<22;h++){
  SLOTS.push(h+':00');
  SLOTS.push(h+':30');
}
// also add 22:00 as the last label row
SLOTS.push('22:00');

function fmtSlot(s){
  const [hh,mm]=s.split(':').map(Number);
  const ampm=hh>=12?'PM':'AM';
  const h=hh>12?hh-12:hh===0?12:hh;
  return h+(mm?':'+String(mm).padStart(2,'0'):'')+' '+ampm;
}

let workers=[],assignments={},weekOffset=0,dragPayload=null,ws=null,reconnectTimer=null;
const isDark=()=>window.matchMedia('(prefers-color-scheme:dark)').matches;
function getColor(id){const idx=workers.findIndex(w=>w.id===id);const p=isDark()?CD:CL;return p[(idx>=0?idx:id)%p.length];}

function getWeekDates(off){
  const now=new Date(),day=now.getDay(),mon=new Date(now);
  mon.setDate(now.getDate()-(day===0?6:day-1)+off*7);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
function dateKey(d){return d.toISOString().slice(0,10);}
const todayKey=dateKey(new Date());
function slotKey(dk,slot){return dk+'|'+slot;}

function setStatus(s){
  document.getElementById('status-badge').className='status-badge '+s;
  document.getElementById('status-text').textContent={connected:'Live',disconnected:'Offline',connecting:'Connecting\u2026'}[s];
}
function getWsUrl(){return(location.protocol==='https:'?'wss:':'ws:')+'//'+ location.host;}
function send(obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}

function connect(){
  if(ws){ws.onclose=null;ws.close();}
  setStatus('connecting');
  ws=new WebSocket(getWsUrl());
  ws.onopen=()=>{setStatus('connected');clearTimeout(reconnectTimer);};
  ws.onmessage=({data})=>{let m;try{m=JSON.parse(data);}catch{return;}handle(m);};
  ws.onclose=()=>{setStatus('disconnected');reconnectTimer=setTimeout(connect,3000);};
  ws.onerror=()=>setStatus('disconnected');
}

function handle(msg){
  switch(msg.type){
    case 'init':workers=msg.payload.workers;assignments=msg.payload.assignments;renderWorkers();renderCalendar();break;
    case 'online_count':document.getElementById('online-count').textContent='\u25cf '+msg.count+' online';break;
    case 'add_worker':if(!workers.find(w=>w.id===msg.worker.id))workers.push(msg.worker);renderWorkers();renderCalendar();break;
    case 'remove_worker':
      workers=workers.filter(w=>w.id!==msg.workerId);
      Object.keys(assignments).forEach(k=>{assignments[k]=(assignments[k]||[]).filter(id=>id!==msg.workerId);});
      renderWorkers();renderCalendar();break;
    case 'assign':
      if(msg.fromKey&&msg.fromKey!==msg.toKey)
        assignments[msg.fromKey]=(assignments[msg.fromKey]||[]).filter(id=>id!==msg.workerId);
      if(!assignments[msg.toKey])assignments[msg.toKey]=[];
      if(!assignments[msg.toKey].includes(msg.workerId))assignments[msg.toKey].push(msg.workerId);
      renderCalendar();break;
    case 'unassign':
      assignments[msg.key]=(assignments[msg.key]||[]).filter(id=>id!==msg.workerId);
      renderCalendar();break;
  }
}

function renderWorkers(){
  const list=document.getElementById('worker-list');list.innerHTML='';
  workers.forEach(w=>{
    const c=getColor(w.id),el=document.createElement('div');
    el.className='worker-block';el.draggable=true;
    el.style.cssText='background:'+c.bg+';border-color:'+c.border+';color:'+c.text;
    el.innerHTML='<div class="worker-info">'+w.name+'<div class="role">'+w.role+'</div></div>'
      +'<button class="worker-delete" data-wid="'+w.id+'">\u00d7</button>';
    el.addEventListener('dragstart',e=>{
      dragPayload={workerId:w.id,fromKey:null};
      setTimeout(()=>el.classList.add('dragging'),0);
      e.dataTransfer.effectAllowed='move';
    });
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    list.appendChild(el);
  });
  list.querySelectorAll('.worker-delete').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const wid=parseInt(btn.dataset.wid);
      if(!confirm('Remove '+(workers.find(w=>w.id===wid)||{}).name+'?'))return;
      send({type:'remove_worker',workerId:wid});
    });
  });
}

function renderCalendar(){
  const days=getWeekDates(weekOffset);
  const grid=document.getElementById('cal-grid');
  grid.innerHTML='';

  // Corner
  const corner=document.createElement('div');corner.className='corner';grid.appendChild(corner);

  // Day headers
  days.forEach((d,i)=>{
    const hdr=document.createElement('div');hdr.className='day-hdr';
    const numEl='<span class="dnum'+(dateKey(d)===todayKey?' today':'')+'">'+d.getDate()+'</span>';
    hdr.innerHTML='<div class="dname">'+DAY_NAMES[i]+'</div>'+numEl;
    grid.appendChild(hdr);
  });

  // Time rows — iterate over slots (28 data slots + last label row handled separately)
  const dataSlots=SLOTS.slice(0,-1); // 28 actual drop slots
  dataSlots.forEach((slot,si)=>{
    const isHour=slot.endsWith(':00');

    // Time label
    const lbl=document.createElement('div');
    lbl.className='time-label'+(isHour?' hour':'');
    lbl.textContent=isHour?fmtSlot(slot):'';
    grid.appendChild(lbl);

    // Day slots
    days.forEach((d,di)=>{
      const dk=dateKey(d);
      const key=slotKey(dk,slot);
      const isWeekend=di>=5;
      const cell=document.createElement('div');
      cell.className='slot'+(isWeekend?' weekend':'')+(isHour?' hour-top':'');
      cell.dataset.key=key;

      (assignments[key]||[]).forEach(wid=>{
        const w=workers.find(x=>x.id===wid);if(!w)return;
        const c=getColor(wid);
        const chip=document.createElement('div');
        chip.className='chip';chip.draggable=true;
        chip.style.cssText='background:'+c.bg+';border-color:'+c.border+';color:'+c.text;
        chip.innerHTML='<span class="chip-name">'+w.name+'</span>'
          +'<button class="chip-remove" data-wid="'+wid+'" data-key="'+key+'">\u00d7</button>';
        chip.addEventListener('dragstart',e=>{
          dragPayload={workerId:wid,fromKey:key};
          e.dataTransfer.effectAllowed='move';
        });
        cell.appendChild(chip);
      });

      cell.addEventListener('dragover',e=>{e.preventDefault();cell.classList.add('drag-over');});
      cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('drag-over');});
      cell.addEventListener('drop',e=>{
        e.preventDefault();cell.classList.remove('drag-over');
        if(!dragPayload)return;
        const{workerId,fromKey}=dragPayload;dragPayload=null;
        send({type:'assign',workerId,toKey:key,fromKey:fromKey||null});
      });

      grid.appendChild(cell);
    });
  });

  // Last time label row (22:00)
  const lastLbl=document.createElement('div');
  lastLbl.className='time-label hour';
  lastLbl.textContent=fmtSlot('22:00');
  grid.appendChild(lastLbl);
  // Fill remaining cells for bottom border
  days.forEach(()=>{
    const fill=document.createElement('div');
    fill.style.cssText='border-right:0.5px solid var(--bd);height:1px;';
    grid.appendChild(fill);
  });

  // chip remove buttons
  grid.querySelectorAll('.chip-remove').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      send({type:'unassign',workerId:parseInt(btn.dataset.wid),key:btn.dataset.key});
    });
  });
}

function updateWeekLabel(){
  const days=getWeekDates(weekOffset),opts={month:'short',day:'numeric'};
  document.getElementById('week-label').textContent=
    days[0].toLocaleDateString('en-US',opts)+' \u2013 '+days[6].toLocaleDateString('en-US',opts);
}

document.getElementById('prev-week').addEventListener('click',()=>{weekOffset--;updateWeekLabel();renderCalendar();});
document.getElementById('next-week').addEventListener('click',()=>{weekOffset++;updateWeekLabel();renderCalendar();});
document.getElementById('add-btn').addEventListener('click',()=>{
  const nameEl=document.getElementById('new-name'),name=nameEl.value.trim();
  if(!name){nameEl.focus();return;}
  send({type:'add_worker',name,role:document.getElementById('new-role').value});
  nameEl.value='';
});
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
        Object.keys(state.assignments).forEach(k => {
          state.assignments[k] = state.assignments[k].filter(id => id !== msg.workerId);
        });
        saveState();
        const out = { type: 'remove_worker', workerId: msg.workerId };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'assign': {
        if (msg.fromKey && msg.fromKey !== msg.toKey)
          state.assignments[msg.fromKey] = (state.assignments[msg.fromKey] || []).filter(id => id !== msg.workerId);
        if (!state.assignments[msg.toKey]) state.assignments[msg.toKey] = [];
        if (!state.assignments[msg.toKey].includes(msg.workerId)) state.assignments[msg.toKey].push(msg.workerId);
        saveState();
        const out = { type: 'assign', workerId: msg.workerId, toKey: msg.toKey, fromKey: msg.fromKey || null };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'unassign': {
        state.assignments[msg.key] = (state.assignments[msg.key] || []).filter(id => id !== msg.workerId);
        saveState();
        const out = { type: 'unassign', workerId: msg.workerId, key: msg.key };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
    }
  });

  ws.on('close', () => broadcastCount());
});

httpServer.listen(PORT, () => console.log('Server running on port ' + PORT));
