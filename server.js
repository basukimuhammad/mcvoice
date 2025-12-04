
// server.js
// Minimal signaling + static file server using Express and ws
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');


const app = express();
const PORT = process.env.PORT || 3000;


// serve static frontend from ./public
app.use(express.static(path.join(__dirname, 'public')));


const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });


// rooms: Map roomId => Map(clientId => ws)
const rooms = new Map();


function send(ws, msg){
try{ ws.send(JSON.stringify(msg)); }catch(e){ console.warn('send fail',e); }
}


function broadcastRoom(roomId, msg, excludeWs){
const room = rooms.get(roomId);
if(!room) return;
for(const [id, client] of room.entries()){
if(client === excludeWs) continue;
send(client, msg);
}
}


wss.on('connection', (ws, req) => {
ws.id = Math.random().toString(36).slice(2,9);
ws.roomId = null;


ws.on('message', (raw) => {
let msg;
try{ msg = JSON.parse(raw); }catch(e){ return; }
const { type, room, to, data } = msg;


if(type === 'join'){
const roomId = room || 'lobby';
ws.roomId = roomId;
if(!rooms.has(roomId)) rooms.set(roomId, new Map());
const roomMap = rooms.get(roomId);
// tell existing peers about new peer
const peers = Array.from(roomMap.keys());
// add ws to room
roomMap.set(ws.id, ws);
// send ack with id and peers list
send(ws, { type:'joined', id: ws.id, peers });
// notify others
broadcastRoom(roomId, { type:'peer-joined', id: ws.id }, ws);
// send members update
broadcastRoom(roomId, { type:'members', members: Array.from(roomMap.keys()) });
return;
}


if(type === 'signal'){
// data should contain {to, from, payload}
const roomId = ws.roomId;
if(!roomId) return;
const roomMap = rooms.get(roomId);
if(!roomMap) return;
const target = roomMap.get(to);
if(target) send(target, { type:'signal', from: ws.id, payload: data });
return;
}


if(type === 'speaking'){
// broadcast speaking state to room (includes {id, speaking})
const roomId = ws.roomId;
if(roomId) broadcastRoom(roomId, { type:'speaking', id: ws.id, speaking: !!data.speaking }, ws);
return;
}


if(type === 'leave'){
// graceful leave
const roomId = ws.roomId;
if(roomId){
const roomMap = rooms.get(roomId);
if(roomMap){ roomMap.delete(ws.id); broadcastRoom(roomId, { type:'peer-left', id: ws.id }); broadcastRoom(roomId, { type:'members', members: Array.from(roomMap.keys()) }); if(roomMap.size===0) rooms.delete(roomId); }
}
ws.roomId = null;
return;
}
});


ws.on('close', ()=>{
const roomId = ws.roomId;
if(roomId){
const roomMap = rooms.get(roomId);
if(roomMap){ roomMap.delete(ws.id); broadcastRoom(roomId, { type:'peer-left', id: ws.id }); broadcastRoom(roomId, { type:'members', members: Array.from(roomMap.keys()) }); if(roomMap.size===0) rooms.delete(roomId); }
}
});
});


server.listen(PORT, ()=>{
console.log('Server listening on port', PORT);
});
