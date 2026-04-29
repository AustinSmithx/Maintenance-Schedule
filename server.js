const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

let state = {
  workers: [
    { id: 1, name: 'Mike Torres', role: 'Electrician' },
    { id: 2, name: 'Sara Chen',   role: 'Plumber'      },
    { id: 3, name: 'James Ward',  role: 'HVAC'         },
    { id: 4, name: 'Priya Patel', role: 'General'      },
    { id: 5, name: 'Dan Kim',     role: 'Painter'      },
  ],
  nextId:      6,
  assignments: {},
};

const STATE_FILE = path.join(__dirname, '.data', 'state.json');
if (fs.existsSync(STATE_FILE)) {
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
}
function saveState() {
  const dir = path.join(__dirname, '.data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const file = path.join(__dirname, 'public', 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(file));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server: httpServer });

function broadcast(message, excludeSocket) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client !== excludeSocket) client.send(data);
  });
}

function broadcastOnlineCount() {
  const msg = JSON.stringify({ type: 'online_count', count: wss.clients.size });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', payload: state }));
  broadcastOnlineCount();

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'add_worker': {
        const worker = { id: state.nextId++, name: msg.name, role: msg.role };
        state.workers.push(worker);
        saveState();
        const out = { type: 'add_worker', worker };
        ws.send(JSON.stringify(out));
        broadcast(out, ws);
        break;
      }
      case 'remove_worker': {
        state.workers = state.workers.filter(w => w.id !== msg.workerId);
        Object.keys(state.assignments).forEach(date => {
          state.assignments[date] = state.assignments[date].filter(id => id !== msg.workerId);
        });
        saveState();
        const out = { type: 'remove_worker', workerId: msg.workerId };
        broadcast(out, ws);
        ws.send(JSON.stringify(out));
        break;
      }
      case 'assign': {
        if (msg.fromDate && msg.fromDate !== msg.toDate) {
          state.assignments[msg.fromDate] = (state.assignments[msg.fromDate] || []).filter(id => id !== msg.workerId);
        }
        if (!state.assignments[msg.toDate]) state.assignments[msg.toDate] = [];
        if (!state.assignments[msg.toDate].includes(msg.workerId)) state.assignments[msg.toDate].push(msg.workerId);
        saveState();
        const out = { type: 'assign', workerId: msg.workerId, toDate: msg.toDate, fromDate: msg.fromDate || null };
        broadcast(out, ws);
        ws.send(JSON.stringify(out));
        break;
      }
      case 'unassign': {
        state.assignments[msg.date] = (state.assignments[msg.date] || []).filter(id => id !== msg.workerId);
        saveState();
        const out = { type: 'unassign', workerId: msg.workerId, date: msg.date };
        broadcast(out, ws);
        ws.send(JSON.stringify(out));
        break;
      }
    }
  });

  ws.on('close', () => broadcastOnlineCount());
});

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
