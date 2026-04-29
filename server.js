const http = require('http');
const { WebSocketServer } = require('ws');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

let state = {
  workers: [
    { id: 1, name: 'Mike Torres', role: 'PTF Upgrade', customer: '' },
    { id: 2, name: 'Sara Chen',   role: 'OS Upgrade',  customer: '' },
    { id: 3, name: 'James Ward',  role: 'PTF Upgrade', customer: '' },
    { id: 4, name: 'Priya Patel', role: 'OS Upgrade',  customer: '' },
    { id: 5, name: 'Dan Kim',     role: 'PTF Upgrade', customer: '' },
  ],
  nextId: 6,
  // assignments: { "2025-05-01|08:00": [1, 3], ... }
  assignments: {},
  // notes: { "2025-05-01|08:00|workerId": "note text" }
  notes: {},
};

const STATE_FILE = path.join(__dirname, 'state.json');
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
}
if (!state.notes) state.notes = {};

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
  --slot-h:38px;--time-col:54px;--day-col:130px;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#1a1a18;--bg1:#1e1e1c;--bg2:#2a2a28;--bg3:#333330;
  --bg-info:#0c2a44;--bg-success:#04342c;--bg-danger:#3a1010;
  --tx:#f0f0ed;--tx2:#a0a09c;--tx3:#6b6b68;
  --tx-info:#85b7eb;--tx-success:#5dcaa5;--tx-danger:#f09595;
  --bd:rgba(255,255,255,0.1);--bd2:rgba(255,255,255,0.2);
}}
body{font-family:var(--font);background:var(--bg);color:var(--tx);min-height:100vh;padding:16px;}
.app{max-width:1200px;margin:0 auto;}

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

.layout{display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:start;}
@media(max-width:600px){.layout{grid-template-columns:1fr;}}

/* sidebar */
.sidebar{background:var(--bg1);border:0.5px solid var(--bd);border-radius:var(--r2);padding:12px;display:flex;flex-direction:column;gap:5px;position:sticky;top:16px;}
.sidebar-label{font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;}
.worker-block{padding:7px 9px;border-radius:var(--r);border:0.5px solid;cursor:grab;user-select:none;font-size:12px;font-weight:500;display:flex;align-items:flex-start;justify-content:space-between;gap:3px;}
.worker-block:active{cursor:grabbing;transform:scale(.97);}
.worker-block.dragging{opacity:.35;}
.worker-info{flex:1;min-width:0;}
.worker-role{font-size:10px;font-weight:400;margin-top:1px;opacity:.7;}
.worker-customer{font-size:10px;font-weight:500;margin-top:1px;opacity:.85;}
.worker-delete{background:none;border:none;cursor:pointer;font-size:13px;color:inherit;opacity:.3;padding:0;line-height:1;flex-shrink:0;transition:opacity .1s;}
.worker-delete:hover{opacity:.9;}
.divider{height:.5px;background:var(--bd);margin:4px 0;}
.add-section{display:flex;flex-direction:column;gap:5px;}
.add-section input,.add-section select{width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--bd2);border-radius:var(--r);background:var(--bg2);color:var(--tx);font-family:var(--font);outline:none;}
.add-section input:focus,.add-section select:focus{border-color:var(--bd-info);box-shadow:0 0 0 2px rgba(55,138,221,.15);}
.add-btn{width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--bd2);border-radius:var(--r);background:transparent;cursor:pointer;color:var(--tx);font-family:var(--font);}
.add-btn:hover{background:var(--bg2);}

/* calendar */
.cal-wrapper{overflow-x:auto;}
.cal-grid{display:grid;grid-template-columns:var(--time-col) repeat(7,var(--day-col));min-width:calc(var(--time-col) + 7*var(--day-col));}
.corner{background:var(--bg2);border-bottom:0.5px solid var(--bd);border-right:0.5px solid var(--bd);position:sticky;left:0;z-index:3;}
.day-hdr{background:var(--bg1);border-bottom:0.5px solid var(--bd);border-right:0.5px solid var(--bd);padding:6px 4px;text-align:center;}
.day-hdr .dname{font-size:10px;font-weight:500;color:var(--tx2);text-transform:uppercase;letter-spacing:.04em;}
.day-hdr .dnum{font-size:14px;font-weight:500;color:var(--tx);width:24px;height:24px;display:flex;align-items:center;justify-content:center;margin:2px auto 0;border-radius:50%;}
.day-hdr .dnum.today{background:var(--bg-info);color:var(--tx-info);}
.time-label{background:var(--bg2);border-right:0.5px solid var(--bd);border-bottom:0.5px solid var(--bd);padding:0 6px;display:flex;align-items:center;justify-content:flex-end;font-size:10px;color:var(--tx3);height:var(--slot-h);position:sticky;left:0;z-index:2;white-space:nowrap;}
.time-label.hour{border-top:0.5px solid var(--bd2);color:var(--tx2);font-weight:500;}
.slot{height:var(--slot-h);border-right:0.5px solid var(--bd);border-bottom:0.5px solid var(--bd);padding:2px;display:flex;flex-direction:column;gap:1px;position:relative;transition:background .1s;}
.slot.hour-top{border-top:0.5px solid var(--bd2);}
.slot.weekend{background:var(--bg2);}
.slot.drag-over{background:var(--bg-info);border-color:var(--bd-info);}

/* chips */
.chip{border-radius:4px;border:0.5px solid;font-size:10px;font-weight:500;padding:2px 4px;display:flex;align-items:center;gap:3px;cursor:pointer;overflow:hidden;flex-shrink:0;transition:opacity .1s;}
.chip:hover{opacity:.85;}
.chip-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}
.chip-note-dot{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.6;flex-shrink:0;}
.chip-remove{background:none;border:none;cursor:pointer;font-size:11px;color:inherit;opacity:.4;padding:0;line-height:1;flex-shrink:0;}
.chip-remove:hover{opacity:1;}

/* notes panel overlay */
.panel-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:100;align-items:center;justify-content:center;}
.panel-backdrop.open{display:flex;}
.panel{background:var(--bg1);border:0.5px solid var(--bd2);border-radius:var(--r2);padding:20px;width:340px;max-width:95vw;display:flex;flex-direction:column;gap:12px;}
.panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.panel-title{font-size:14px;font-weight:600;color:var(--tx);}
.panel-sub{font-size:11px;color:var(--tx2);margin-top:2px;}
.panel-close{background:none;border:none;cursor:pointer;font-size:18px;color:var(--tx2);line-height:1;padding:0;flex-shrink:0;}
.panel-close:hover{color:var(--tx);}
.panel-label{font-size:11px;font-weight:500;color:var(--tx2);margin-bottom:4px;}
.panel textarea{width:100%;font-size:12px;padding:8px;border:0.5px solid var(--bd2);border-radius:var(--r);background:var(--bg2);color:var(--tx);font-family:var(--font);outline:none;resize:vertical;min-height:100px;line-height:1.5;}
.panel textarea:focus{border-color:var(--bd-info);box-shadow:0 0 0 2px rgba(55,138,221,.15);}
.panel-actions{display:flex;gap:8px;justify-content:flex-end;}
.btn-save{font-size:12px;padding:6px 14px;border:none;border-radius:var(--r);background:#185fa5;color:#fff;cursor:pointer;font-family:var(--font);}
.btn-save:hover{background:#0c447c;}
.btn-cancel{font-size:12px;padding:6px 14px;border:0.5px solid var(--bd2);border-radius:var(--r);background:transparent;color:var(--tx);cursor:pointer;font-family:var(--font);}
.btn-cancel:hover{background:var(--bg2);}
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
        <select id="new-customer">
          <option value="">No customer</option>
        </select>
        <input id="new-customer-custom" placeholder="Or type customer name" style="display:none"/>
        <button class="add-btn" id="add-btn">+ Add Worker</button>
      </div>
    </div>
    <div class="cal-wrapper">
      <div class="cal-grid" id="cal-grid"></div>
    </div>
  </div>
</div>

<!-- Notes panel -->
<div class="panel-backdrop" id="panel-backdrop">
  <div class="panel">
    <div class="panel-header">
      <div>
        <div class="panel-title" id="panel-title">Notes</div>
        <div class="panel-sub" id="panel-sub"></div>
      </div>
      <button class="panel-close" id="panel-close">&#215;</button>
    </div>
    <div>
      <div class="panel-label">Customer note</div>
      <textarea id="panel-note" placeholder="Add a note for this customer&#8230;"></textarea>
    </div>
    <div class="panel-actions">
      <button class="btn-cancel" id="panel-cancel">Cancel</button>
      <button class="btn-save" id="panel-save">Save note</button>
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

const SLOTS=[];
for(let h=8;h<22;h++){SLOTS.push(h+':00');SLOTS.push(h+':30');}

function fmtSlot(s){
  const[hh,mm]=s.split(':').map(Number);
  const ap=hh>=12?'PM':'AM',h=hh>12?hh-12:hh===0?12:hh;
  return h+(mm?':'+String(mm).padStart(2,'0'):'')+'\u202f'+ap;
}

let workers=[],assignments={},notes={},weekOffset=0,dragPayload=null;
let ws=null,reconnectTimer=null;

// known customers (built dynamically from workers)
function getCustomers(){
  const set=new Set();
  workers.forEach(w=>{if(w.customer)set.add(w.customer);});
  return [...set].sort();
}

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
function noteKey(sk,wid){return sk+'|'+wid;}

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
    case 'init':
      workers=msg.payload.workers;
      assignments=msg.payload.assignments;
      notes=msg.payload.notes||{};
      renderWorkers();renderCalendar();break;
    case 'online_count':document.getElementById('online-count').textContent='\u25cf '+msg.count+' online';break;
    case 'add_worker':
      if(!workers.find(w=>w.id===msg.worker.id))workers.push(msg.worker);
      renderWorkers();renderCalendar();break;
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
    case 'save_note':
      notes[msg.nk]=msg.text;
      renderCalendar();break;
  }
}

// ── Customer dropdown helpers ────────────────────────────────────────
function refreshCustomerDropdown(){
  const sel=document.getElementById('new-customer');
  const cur=sel.value;
  sel.innerHTML='<option value="">No customer</option>';
  getCustomers().forEach(c=>{
    const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);
  });
  const customOpt=document.createElement('option');customOpt.value='__custom__';customOpt.textContent='+ Type custom\u2026';sel.appendChild(customOpt);
  if(cur)sel.value=cur;
}

document.getElementById('new-customer').addEventListener('change',function(){
  const ci=document.getElementById('new-customer-custom');
  ci.style.display=this.value==='__custom__'?'block':'none';
  if(this.value==='__custom__')ci.focus();
});

// ── Sidebar render ───────────────────────────────────────────────────
function renderWorkers(){
  refreshCustomerDropdown();
  const list=document.getElementById('worker-list');list.innerHTML='';
  workers.forEach(w=>{
    const c=getColor(w.id),el=document.createElement('div');
    el.className='worker-block';el.draggable=true;
    el.style.cssText='background:'+c.bg+';border-color:'+c.border+';color:'+c.text;
    el.innerHTML='<div class="worker-info">'
      +w.name
      +'<div class="worker-role">'+w.role+'</div>'
      +(w.customer?'<div class="worker-customer">'+w.customer+'</div>':'')
      +'</div>'
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

document.getElementById('add-btn').addEventListener('click',()=>{
  const nameEl=document.getElementById('new-name');
  const name=nameEl.value.trim();if(!name){nameEl.focus();return;}
  const role=document.getElementById('new-role').value;
  const custSel=document.getElementById('new-customer').value;
  const custCustom=document.getElementById('new-customer-custom').value.trim();
  const customer=custSel==='__custom__'?custCustom:custSel;
  send({type:'add_worker',name,role,customer});
  nameEl.value='';
  document.getElementById('new-customer-custom').value='';
  document.getElementById('new-customer-custom').style.display='none';
  document.getElementById('new-customer').value='';
});
document.getElementById('new-name').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('add-btn').click();});

// ── Calendar render ──────────────────────────────────────────────────
function renderCalendar(){
  const days=getWeekDates(weekOffset);
  const grid=document.getElementById('cal-grid');
  grid.innerHTML='';

  const corner=document.createElement('div');corner.className='corner';grid.appendChild(corner);
  days.forEach((d,i)=>{
    const hdr=document.createElement('div');hdr.className='day-hdr';
    hdr.innerHTML='<div class="dname">'+DAY_NAMES[i]+'</div>'
      +'<span class="dnum'+(dateKey(d)===todayKey?' today':'')+'">'+d.getDate()+'</span>';
    grid.appendChild(hdr);
  });

  const dataSlots=SLOTS.slice(0,-1);
  dataSlots.forEach((slot,si)=>{
    const isHour=slot.endsWith(':00');
    const lbl=document.createElement('div');
    lbl.className='time-label'+(isHour?' hour':'');
    lbl.textContent=isHour?fmtSlot(slot):'';
    grid.appendChild(lbl);

    days.forEach((d,di)=>{
      const dk=dateKey(d),key=slotKey(dk,slot),isWeekend=di>=5;
      const cell=document.createElement('div');
      cell.className='slot'+(isWeekend?' weekend':'')+(isHour?' hour-top':'');
      cell.dataset.key=key;

      (assignments[key]||[]).forEach(wid=>{
        const w=workers.find(x=>x.id===wid);if(!w)return;
        const c=getColor(wid);
        const nk=noteKey(key,wid);
        const hasNote=!!(notes[nk]&&notes[nk].trim());
        const chip=document.createElement('div');
        chip.className='chip';chip.draggable=true;
        chip.style.cssText='background:'+c.bg+';border-color:'+c.border+';color:'+c.text;
        chip.innerHTML=(w.customer?'<span class="chip-name">'+w.name+' \u2022 '+w.customer+'</span>':'<span class="chip-name">'+w.name+'</span>')
          +(hasNote?'<span class="chip-note-dot" title="Has note"></span>':'')
          +'<button class="chip-remove" data-wid="'+wid+'" data-key="'+key+'">\u00d7</button>';

        chip.addEventListener('click',e=>{
          if(e.target.classList.contains('chip-remove'))return;
          openPanel(key,wid,w,slot,d);
        });
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

  // Bottom border row
  const lastLbl=document.createElement('div');lastLbl.className='time-label hour';lastLbl.textContent=fmtSlot('22:00');grid.appendChild(lastLbl);
  days.forEach(()=>{const f=document.createElement('div');f.style.cssText='border-right:0.5px solid var(--bd);height:1px;';grid.appendChild(f);});

  grid.querySelectorAll('.chip-remove').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      send({type:'unassign',workerId:parseInt(btn.dataset.wid),key:btn.dataset.key});
    });
  });
}

// ── Notes panel ──────────────────────────────────────────────────────
let panelState=null;

function openPanel(key,wid,w,slot,date){
  const nk=noteKey(key,wid);
  panelState={nk};
  const opts={weekday:'short',month:'short',day:'numeric'};
  document.getElementById('panel-title').textContent=w.name+(w.customer?' \u2022 '+w.customer:'');
  document.getElementById('panel-sub').textContent=w.role+' \u2013 '+date.toLocaleDateString('en-US',opts)+' at '+fmtSlot(slot);
  document.getElementById('panel-note').value=notes[nk]||'';
  document.getElementById('panel-backdrop').classList.add('open');
  setTimeout(()=>document.getElementById('panel-note').focus(),50);
}

function closePanel(){
  document.getElementById('panel-backdrop').classList.remove('open');
  panelState=null;
}

document.getElementById('panel-close').addEventListener('click',closePanel);
document.getElementById('panel-cancel').addEventListener('click',closePanel);
document.getElementById('panel-backdrop').addEventListener('click',e=>{if(e.target===document.getElementById('panel-backdrop'))closePanel();});

document.getElementById('panel-save').addEventListener('click',()=>{
  if(!panelState)return;
  const text=document.getElementById('panel-note').value;
  send({type:'save_note',nk:panelState.nk,text});
  notes[panelState.nk]=text;
  closePanel();
  renderCalendar();
});

// ── Week nav ─────────────────────────────────────────────────────────
function updateWeekLabel(){
  const days=getWeekDates(weekOffset),opts={month:'short',day:'numeric'};
  document.getElementById('week-label').textContent=days[0].toLocaleDateString('en-US',opts)+' \u2013 '+days[6].toLocaleDateString('en-US',opts);
}
document.getElementById('prev-week').addEventListener('click',()=>{weekOffset--;updateWeekLabel();renderCalendar();});
document.getElementById('next-week').addEventListener('click',()=>{weekOffset++;updateWeekLabel();renderCalendar();});

updateWeekLabel();connect();
</script>
</body>
</html>`;

// ── HTTP ──────────────────────────────────────────────────────────────
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
        const worker = { id: state.nextId++, name: msg.name, role: msg.role, customer: msg.customer || '' };
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
      case 'save_note': {
        state.notes[msg.nk] = msg.text;
        saveState();
        const out = { type: 'save_note', nk: msg.nk, text: msg.text };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
    }
  });

  ws.on('close', () => broadcastCount());
});

httpServer.listen(PORT, () => console.log('Server running on port ' + PORT));
