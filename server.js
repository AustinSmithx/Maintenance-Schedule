const http = require('http');
const { WebSocketServer } = require('ws');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

let state = {
  workers: [
    { id: 'w1', name: 'Mike Torres', role: 'PTF Upgrade' },
    { id: 'w2', name: 'Sara Chen',   role: 'OS Upgrade'  },
    { id: 'w3', name: 'James Ward',  role: 'PTF Upgrade' },
    { id: 'w4', name: 'Priya Patel', role: 'OS Upgrade'  },
    { id: 'w5', name: 'Dan Kim',     role: 'PTF Upgrade' },
  ],
  customers: [
    { id: 'c1', name: 'Acme Corp' },
    { id: 'c2', name: 'Beta LLC'  },
  ],
  nextWorkerId: 6,
  nextCustomerId: 3,
  // slots: { "2025-05-01|08:00": [ { customerId, workerIds:[], note } ] }
  slots: {},
};

const STATE_FILE = path.join(__dirname, 'state.json');
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
}
if (!state.slots) state.slots = {};
if (!state.customers) state.customers = [];

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
  --bg:#f5f5f3;--bg1:#fff;--bg2:#f5f5f3;
  --bg-info:#e6f1fb;--bg-success:#e1f5ee;--bg-danger:#fcebeb;--bg-warn:#faeeda;
  --tx:#1a1a18;--tx2:#6b6b68;--tx3:#9b9b97;
  --tx-info:#185fa5;--tx-success:#085041;--tx-danger:#a32d2d;--tx-warn:#633806;
  --bd:rgba(0,0,0,0.12);--bd2:rgba(0,0,0,0.22);--bd-info:#378add;
  --r:8px;--r2:12px;
  --font:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --slot-h:40px;--time-col:54px;--day-col:150px;
}
@media(prefers-color-scheme:dark){:root{
  --bg:#1a1a18;--bg1:#1e1e1c;--bg2:#2a2a28;
  --bg-info:#0c2a44;--bg-success:#04342c;--bg-danger:#3a1010;--bg-warn:#412402;
  --tx:#f0f0ed;--tx2:#a0a09c;--tx3:#6b6b68;
  --tx-info:#85b7eb;--tx-success:#5dcaa5;--tx-danger:#f09595;--tx-warn:#fac775;
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
.layout{display:grid;grid-template-columns:165px 1fr;gap:12px;align-items:start;}
.sidebar{background:var(--bg1);border:0.5px solid var(--bd);border-radius:var(--r2);padding:12px;display:flex;flex-direction:column;gap:6px;position:sticky;top:16px;max-height:calc(100vh - 80px);overflow-y:auto;}
.sec-label{font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-top:4px;}
.divider{height:.5px;background:var(--bd);margin:2px 0;}
.customer-block{padding:7px 9px;border-radius:var(--r);border:0.5px solid #BA7517;cursor:grab;user-select:none;font-size:12px;font-weight:500;background:var(--bg-warn);color:var(--tx-warn);display:flex;align-items:center;justify-content:space-between;gap:3px;}
.customer-block:active{cursor:grabbing;transform:scale(.97);}
.customer-block.dragging{opacity:.35;}
.worker-block{padding:7px 9px;border-radius:var(--r);border:0.5px solid;user-select:none;font-size:12px;font-weight:500;display:flex;align-items:flex-start;justify-content:space-between;gap:3px;}
.item-info{flex:1;min-width:0;}
.item-sub{font-size:10px;font-weight:400;margin-top:1px;opacity:.7;}
.item-del{background:none;border:none;cursor:pointer;font-size:13px;color:inherit;opacity:.3;padding:0;line-height:1;flex-shrink:0;transition:opacity .1s;}
.item-del:hover{opacity:.9;}
.add-form{display:flex;flex-direction:column;gap:4px;}
.add-form input,.add-form select{width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--bd2);border-radius:var(--r);background:var(--bg2);color:var(--tx);font-family:var(--font);outline:none;}
.add-form input:focus,.add-form select:focus{border-color:var(--bd-info);}
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
.slot{min-height:var(--slot-h);border-right:0.5px solid var(--bd);border-bottom:0.5px solid var(--bd);padding:2px;display:flex;flex-direction:column;gap:2px;transition:background .1s;}
.slot.hour-top{border-top:0.5px solid var(--bd2);}
.slot.weekend{background:var(--bg2);}
.slot.drag-over{background:var(--bg-info);border-color:var(--bd-info);}
.entry{border-radius:5px;border:0.5px solid #BA7517;padding:3px 5px;background:var(--bg-warn);color:var(--tx-warn);font-size:10px;font-weight:500;display:flex;flex-direction:column;gap:1px;cursor:pointer;}
.entry:hover{opacity:.85;}
.entry-top{display:flex;align-items:center;justify-content:space-between;gap:3px;}
.entry-customer{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}
.entry-remove{background:none;border:none;cursor:pointer;font-size:11px;color:inherit;opacity:.5;padding:0;line-height:1;flex-shrink:0;}
.entry-remove:hover{opacity:1;}
.entry-workers{font-size:9px;opacity:.8;}
.entry-note{font-size:9px;opacity:.65;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.entry-dot{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.5;flex-shrink:0;}

/* panel */
.panel-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100;align-items:center;justify-content:center;}
.panel-backdrop.open{display:flex;}
.panel{background:var(--bg1);border:0.5px solid var(--bd2);border-radius:var(--r2);padding:20px;width:380px;max-width:95vw;display:flex;flex-direction:column;gap:14px;max-height:90vh;overflow-y:auto;}
.panel-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.panel-title{font-size:15px;font-weight:600;}
.panel-sub{font-size:11px;color:var(--tx2);margin-top:3px;}
.panel-close{background:none;border:none;cursor:pointer;font-size:20px;color:var(--tx2);line-height:1;padding:0;flex-shrink:0;}
.panel-close:hover{color:var(--tx);}
.panel-field{display:flex;flex-direction:column;gap:6px;}
.panel-field label{font-size:11px;font-weight:500;color:var(--tx2);}

/* worker checkboxes */
.worker-checks{display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;border:0.5px solid var(--bd2);border-radius:var(--r);padding:6px;}
.worker-check-row{display:flex;align-items:center;gap:8px;cursor:pointer;padding:3px 4px;border-radius:6px;}
.worker-check-row:hover{background:var(--bg2);}
.worker-check-row input[type=checkbox]{width:14px;height:14px;cursor:pointer;accent-color:#185fa5;flex-shrink:0;}
.worker-check-label{font-size:12px;color:var(--tx);}
.worker-check-sub{font-size:10px;color:var(--tx2);margin-left:auto;}

.panel-field textarea{font-size:12px;padding:8px;border:0.5px solid var(--bd2);border-radius:var(--r);background:var(--bg2);color:var(--tx);font-family:var(--font);outline:none;resize:vertical;min-height:80px;line-height:1.5;}
.panel-field textarea:focus{border-color:var(--bd-info);}
.panel-actions{display:flex;gap:8px;justify-content:flex-end;}
.btn-primary{font-size:12px;padding:6px 16px;border:none;border-radius:var(--r);background:#185fa5;color:#fff;cursor:pointer;font-family:var(--font);}
.btn-primary:hover{background:#0c447c;}
.btn-ghost{font-size:12px;padding:6px 14px;border:0.5px solid var(--bd2);border-radius:var(--r);background:transparent;color:var(--tx);cursor:pointer;font-family:var(--font);}
.btn-ghost:hover{background:var(--bg2);}
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
      <div class="sec-label">Customers</div>
      <div id="customer-list"></div>
      <div class="add-form">
        <input id="new-customer-name" placeholder="Customer name" maxlength="30"/>
        <button class="add-btn" id="add-customer-btn">+ Add Customer</button>
      </div>
      <div class="divider"></div>
      <div class="sec-label">Workers</div>
      <div id="worker-list"></div>
      <div class="add-form">
        <input id="new-worker-name" placeholder="Worker name" maxlength="20"/>
        <select id="new-worker-role">
          <option value="PTF Upgrade">PTF Upgrade</option>
          <option value="OS Upgrade">OS Upgrade</option>
        </select>
        <button class="add-btn" id="add-worker-btn">+ Add Worker</button>
      </div>
    </div>

    <div class="cal-wrapper">
      <div class="cal-grid" id="cal-grid"></div>
    </div>
  </div>
</div>

<!-- Panel -->
<div class="panel-backdrop" id="panel-backdrop">
  <div class="panel">
    <div class="panel-hdr">
      <div>
        <div class="panel-title" id="panel-title"></div>
        <div class="panel-sub" id="panel-sub"></div>
      </div>
      <button class="panel-close" id="panel-close">&#215;</button>
    </div>
    <div class="panel-field">
      <label>Assign workers (select all that apply)</label>
      <div class="worker-checks" id="worker-checks"></div>
    </div>
    <div class="panel-field">
      <label>Note</label>
      <textarea id="panel-note" placeholder="Add a note&#8230;"></textarea>
    </div>
    <div class="panel-actions">
      <button class="btn-ghost" id="panel-cancel">Cancel</button>
      <button class="btn-primary" id="panel-save">Save</button>
    </div>
  </div>
</div>

<script>
const WC=[
  {bg:'#E6F1FB',border:'#378ADD',text:'#0C447C'},
  {bg:'#E1F5EE',border:'#1D9E75',text:'#085041'},
  {bg:'#FAEEDA',border:'#BA7517',text:'#633806'},
  {bg:'#FBEAF0',border:'#D4537E',text:'#72243E'},
  {bg:'#EEEDFE',border:'#7F77DD',text:'#3C3489'},
  {bg:'#FAECE7',border:'#D85A30',text:'#712B13'},
  {bg:'#EAF3DE',border:'#639922',text:'#27500A'},
];
const WCD=[
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
function fmtSlot(s){const[hh,mm]=s.split(':').map(Number);const ap=hh>=12?'PM':'AM',h=hh>12?hh-12:hh===0?12:hh;return h+(mm?':'+String(mm).padStart(2,'0'):'')+'\u202f'+ap;}

let workers=[],customers=[],slots={},weekOffset=0,dragPayload=null,ws=null,reconnectTimer=null;
const isDark=()=>window.matchMedia('(prefers-color-scheme:dark)').matches;
function wColor(id){const idx=workers.findIndex(w=>w.id===id);const p=isDark()?WCD:WC;return p[(idx>=0?idx:parseInt((id+'').replace(/\D/g,''),10)||0)%p.length];}
function getWeekDates(off){const now=new Date(),day=now.getDay(),mon=new Date(now);mon.setDate(now.getDate()-(day===0?6:day-1)+off*7);return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});}
function dateKey(d){return d.toISOString().slice(0,10);}
const todayKey=dateKey(new Date());
function slotKey(dk,s){return dk+'|'+s;}

function setStatus(s){document.getElementById('status-badge').className='status-badge '+s;document.getElementById('status-text').textContent={connected:'Live',disconnected:'Offline',connecting:'Connecting\u2026'}[s];}
function getWsUrl(){return(location.protocol==='https:'?'wss:':'ws:')+'//'+ location.host;}
function send(obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}

function connect(){
  if(ws){ws.onclose=null;ws.close();}setStatus('connecting');
  ws=new WebSocket(getWsUrl());
  ws.onopen=()=>{setStatus('connected');clearTimeout(reconnectTimer);};
  ws.onmessage=({data})=>{let m;try{m=JSON.parse(data);}catch{return;}handle(m);};
  ws.onclose=()=>{setStatus('disconnected');reconnectTimer=setTimeout(connect,3000);};
  ws.onerror=()=>setStatus('disconnected');
}

function handle(msg){
  switch(msg.type){
    case 'init':workers=msg.payload.workers;customers=msg.payload.customers;slots=msg.payload.slots||{};renderSidebar();renderCalendar();break;
    case 'online_count':document.getElementById('online-count').textContent='\u25cf '+msg.count+' online';break;
    case 'add_worker':if(!workers.find(w=>w.id===msg.worker.id))workers.push(msg.worker);renderSidebar();break;
    case 'add_customer':if(!customers.find(c=>c.id===msg.customer.id))customers.push(msg.customer);renderSidebar();break;
    case 'remove_worker':workers=workers.filter(w=>w.id!==msg.id);renderSidebar();renderCalendar();break;
    case 'remove_customer':
      customers=customers.filter(c=>c.id!==msg.id);
      Object.keys(slots).forEach(k=>{slots[k]=(slots[k]||[]).filter(e=>e.customerId!==msg.id);});
      renderSidebar();renderCalendar();break;
    case 'add_entry':
      if(!slots[msg.key])slots[msg.key]=[];
      if(!slots[msg.key].find(e=>e.customerId===msg.entry.customerId))slots[msg.key].push(msg.entry);
      renderCalendar();break;
    case 'remove_entry':
      slots[msg.key]=(slots[msg.key]||[]).filter(e=>e.customerId!==msg.customerId);
      renderCalendar();break;
    case 'update_entry':{
      const arr=slots[msg.key]||[];const i=arr.findIndex(e=>e.customerId===msg.customerId);
      if(i>=0){arr[i].workerIds=msg.workerIds;arr[i].note=msg.note;}
      renderCalendar();break;}
  }
}

// ── Sidebar ──────────────────────────────────────────────────────────
function renderSidebar(){
  const cl=document.getElementById('customer-list');cl.innerHTML='';
  customers.forEach(c=>{
    const el=document.createElement('div');el.className='customer-block';el.draggable=true;
    el.innerHTML='<span class="item-info">'+c.name+'</span><button class="item-del" data-id="'+c.id+'" data-type="customer">\u00d7</button>';
    el.addEventListener('dragstart',e=>{dragPayload={type:'customer',customerId:c.id};setTimeout(()=>el.classList.add('dragging'),0);e.dataTransfer.effectAllowed='move';});
    el.addEventListener('dragend',()=>el.classList.remove('dragging'));
    cl.appendChild(el);
  });

  const wl=document.getElementById('worker-list');wl.innerHTML='';
  workers.forEach(w=>{
    const c=wColor(w.id),el=document.createElement('div');
    el.className='worker-block';
    el.style.cssText='background:'+c.bg+';border-color:'+c.border+';color:'+c.text;
    el.innerHTML='<div class="item-info">'+w.name+'<div class="item-sub">'+w.role+'</div></div>'
      +'<button class="item-del" data-id="'+w.id+'" data-type="worker">\u00d7</button>';
    wl.appendChild(el);
  });

  document.querySelectorAll('.item-del').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const{id,type}=btn.dataset;
      if(!confirm('Remove?'))return;
      send({type:'remove_'+type,id});
    });
  });
}

document.getElementById('add-customer-btn').addEventListener('click',()=>{
  const el=document.getElementById('new-customer-name'),name=el.value.trim();
  if(!name){el.focus();return;}send({type:'add_customer',name});el.value='';
});
document.getElementById('new-customer-name').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('add-customer-btn').click();});
document.getElementById('add-worker-btn').addEventListener('click',()=>{
  const el=document.getElementById('new-worker-name'),name=el.value.trim();
  if(!name){el.focus();return;}send({type:'add_worker',name,role:document.getElementById('new-worker-role').value});el.value='';
});
document.getElementById('new-worker-name').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('add-worker-btn').click();});

// ── Calendar ─────────────────────────────────────────────────────────
function renderCalendar(){
  const days=getWeekDates(weekOffset);
  const grid=document.getElementById('cal-grid');grid.innerHTML='';
  const corner=document.createElement('div');corner.className='corner';grid.appendChild(corner);
  days.forEach((d,i)=>{
    const hdr=document.createElement('div');hdr.className='day-hdr';
    hdr.innerHTML='<div class="dname">'+DAY_NAMES[i]+'</div><span class="dnum'+(dateKey(d)===todayKey?' today':'')+'">'+d.getDate()+'</span>';
    grid.appendChild(hdr);
  });

  SLOTS.slice(0,-1).forEach(slot=>{
    const isHour=slot.endsWith(':00');
    const lbl=document.createElement('div');lbl.className='time-label'+(isHour?' hour':'');lbl.textContent=isHour?fmtSlot(slot):'';
    grid.appendChild(lbl);
    days.forEach((d,di)=>{
      const dk=dateKey(d),key=slotKey(dk,slot),isWeekend=di>=5;
      const cell=document.createElement('div');
      cell.className='slot'+(isWeekend?' weekend':'')+(isHour?' hour-top':'');
      cell.dataset.key=key;

      (slots[key]||[]).forEach(entry=>{
        const cust=customers.find(c=>c.id===entry.customerId);if(!cust)return;
        const workerIds=entry.workerIds||[];
        const workerNames=workerIds.map(id=>{const w=workers.find(x=>x.id===id);return w?w.name:null;}).filter(Boolean);
        const card=document.createElement('div');card.className='entry';
        card.innerHTML='<div class="entry-top">'
          +'<span class="entry-customer">'+cust.name+'</span>'
          +(entry.note?'<span class="entry-dot"></span>':'')
          +'<button class="entry-remove" data-key="'+key+'" data-cid="'+entry.customerId+'">\u00d7</button>'
          +'</div>'
          +(workerNames.length?'<div class="entry-workers">'+workerNames.join(', ')+'</div>':'')
          +(entry.note?'<div class="entry-note">'+entry.note+'</div>':'');
        card.addEventListener('click',e=>{if(e.target.classList.contains('entry-remove'))return;openPanel(key,entry,cust,slot,d);});
        cell.appendChild(card);
      });

      cell.addEventListener('dragover',e=>{e.preventDefault();cell.classList.add('drag-over');});
      cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('drag-over');});
      cell.addEventListener('drop',e=>{
        e.preventDefault();cell.classList.remove('drag-over');
        if(!dragPayload||dragPayload.type!=='customer')return;
        const{customerId}=dragPayload;dragPayload=null;
        send({type:'add_entry',key,entry:{customerId,workerIds:[],note:''}});
      });
      grid.appendChild(cell);
    });
  });

  // bottom border
  const lastLbl=document.createElement('div');lastLbl.className='time-label hour';lastLbl.textContent=fmtSlot('22:00');grid.appendChild(lastLbl);
  days.forEach(()=>{const f=document.createElement('div');f.style.cssText='border-right:0.5px solid var(--bd);height:1px;';grid.appendChild(f);});

  grid.querySelectorAll('.entry-remove').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();send({type:'remove_entry',key:btn.dataset.key,customerId:btn.dataset.cid});});
  });
}

// ── Panel ─────────────────────────────────────────────────────────────
let panelCtx=null;
function openPanel(key,entry,cust,slot,date){
  panelCtx={key,customerId:entry.customerId};
  const opts={weekday:'short',month:'short',day:'numeric'};
  document.getElementById('panel-title').textContent=cust.name;
  document.getElementById('panel-sub').textContent=date.toLocaleDateString('en-US',opts)+' at '+fmtSlot(slot);

  // build worker checkboxes
  const container=document.getElementById('worker-checks');container.innerHTML='';
  const selected=new Set(entry.workerIds||[]);
  if(workers.length===0){container.innerHTML='<div style="font-size:11px;color:var(--tx3);padding:4px;">No workers added yet</div>';}
  workers.forEach(w=>{
    const row=document.createElement('label');row.className='worker-check-row';
    const cb=document.createElement('input');cb.type='checkbox';cb.value=w.id;cb.checked=selected.has(w.id);
    const nameSpan=document.createElement('span');nameSpan.className='worker-check-label';nameSpan.textContent=w.name;
    const roleSpan=document.createElement('span');roleSpan.className='worker-check-sub';roleSpan.textContent=w.role;
    row.appendChild(cb);row.appendChild(nameSpan);row.appendChild(roleSpan);
    container.appendChild(row);
  });

  document.getElementById('panel-note').value=entry.note||'';
  document.getElementById('panel-backdrop').classList.add('open');
  setTimeout(()=>document.getElementById('panel-note').focus(),50);
}
function closePanel(){document.getElementById('panel-backdrop').classList.remove('open');panelCtx=null;}
document.getElementById('panel-close').addEventListener('click',closePanel);
document.getElementById('panel-cancel').addEventListener('click',closePanel);
document.getElementById('panel-backdrop').addEventListener('click',e=>{if(e.target===document.getElementById('panel-backdrop'))closePanel();});
document.getElementById('panel-save').addEventListener('click',()=>{
  if(!panelCtx)return;
  const workerIds=[...document.getElementById('worker-checks').querySelectorAll('input[type=checkbox]:checked')].map(cb=>cb.value);
  const note=document.getElementById('panel-note').value;
  send({type:'update_entry',key:panelCtx.key,customerId:panelCtx.customerId,workerIds,note});
  closePanel();
});

function updateWeekLabel(){const days=getWeekDates(weekOffset),opts={month:'short',day:'numeric'};document.getElementById('week-label').textContent=days[0].toLocaleDateString('en-US',opts)+' \u2013 '+days[6].toLocaleDateString('en-US',opts);}
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
        const worker = { id: 'w' + state.nextWorkerId++, name: msg.name, role: msg.role };
        state.workers.push(worker); saveState();
        const out = { type: 'add_worker', worker };
        ws.send(JSON.stringify(out)); broadcast(out, ws); break;
      }
      case 'add_customer': {
        const customer = { id: 'c' + state.nextCustomerId++, name: msg.name };
        state.customers.push(customer); saveState();
        const out = { type: 'add_customer', customer };
        ws.send(JSON.stringify(out)); broadcast(out, ws); break;
      }
      case 'remove_worker': {
        state.workers = state.workers.filter(w => w.id !== msg.id);
        Object.keys(state.slots).forEach(k => {
          (state.slots[k] || []).forEach(e => {
            if (e.workerIds) e.workerIds = e.workerIds.filter(id => id !== msg.id);
          });
        });
        saveState();
        const out = { type: 'remove_worker', id: msg.id };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'remove_customer': {
        state.customers = state.customers.filter(c => c.id !== msg.id);
        Object.keys(state.slots).forEach(k => {
          state.slots[k] = (state.slots[k] || []).filter(e => e.customerId !== msg.id);
        });
        saveState();
        const out = { type: 'remove_customer', id: msg.id };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'add_entry': {
        if (!state.slots[msg.key]) state.slots[msg.key] = [];
        if (!state.slots[msg.key].find(e => e.customerId === msg.entry.customerId)) {
          state.slots[msg.key].push({ customerId: msg.entry.customerId, workerIds: [], note: '' });
        }
        saveState();
        const out = { type: 'add_entry', key: msg.key, entry: msg.entry };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'remove_entry': {
        state.slots[msg.key] = (state.slots[msg.key] || []).filter(e => e.customerId !== msg.customerId);
        saveState();
        const out = { type: 'remove_entry', key: msg.key, customerId: msg.customerId };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
      case 'update_entry': {
        const arr = state.slots[msg.key] || [];
        const idx = arr.findIndex(e => e.customerId === msg.customerId);
        if (idx >= 0) { arr[idx].workerIds = msg.workerIds; arr[idx].note = msg.note; }
        saveState();
        const out = { type: 'update_entry', key: msg.key, customerId: msg.customerId, workerIds: msg.workerIds, note: msg.note };
        broadcast(out, ws); ws.send(JSON.stringify(out)); break;
      }
    }
  });

  ws.on('close', () => broadcastCount());
});

httpServer.listen(PORT, () => console.log('Server running on port ' + PORT));
