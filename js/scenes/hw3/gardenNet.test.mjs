// Run: node --test js/scenes/hw3/gardenNet.test.mjs
// Runs the course's real server/client.js in fake browser tabs, joined by a fake
// relay that forwards messages like server/main.js, and checks that the pages agree.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const load = async file => {
   const source = await readFile(new URL(file, import.meta.url),'utf8');
   return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
};
const { applyGardenMessage, emptyGarden, GARDEN } = await load('./echoGardenRules.js');
const { createGardenSync } = await load('./gardenNet.js');
const clientSource = await readFile(new URL('../../../server/client.js', import.meta.url),'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function network(latency = 20) {
   const sockets = [], clients = [];
   const deliver = (data, except) => setTimeout(() =>
      sockets.forEach((s,i) => i !== except && s.onmessage?.({data})), latency);
   const connect = () => {
      const socket = {readyState:1, send: data => deliver(data, socket.index)};
      socket.index = sockets.length; sockets.push(socket); clients.push(socket.index);
      setTimeout(() => socket.onmessage?.({data:JSON.stringify({global:'clientID',value:socket.index})}), latency);
      deliver(JSON.stringify({global:'clients', value:clients}), -1);
      return socket;
   };
   const tabs = [];
   const open = () => {
      const win = {name:'', location:{protocol:'http:',host:'test'}, console:{log(){}},
                   Date, JSON, Math, Object, Array, setTimeout, performance};
      win.window = win;
      win.XMLHttpRequest = class { open(){} send(){ setTimeout(() => this.onloadend?.(), 5); } get responseText(){ return 'Cannot GET'; } };
      win.FormData = class { append(){} };
      win.WebSocket = class { constructor(){ return connect(); } };
      win.Peer = class { on(){} };
      win.isMasterClient = () => win.clientID == win.clients[0];
      vm.createContext(win);
      vm.runInContext(clientSource + '\nwindow.server = new Server(0);', win);
      win.server.init('echoGarden', emptyGarden());
      const net = createGardenSync({server:win.server, win, name:'echoGarden',
                                    apply: m => applyGardenMessage(win.echoGarden, m),
                                    snapshot: () => win.echoGarden,
                                    mergeSnapshot: incoming => {
                                       for (const [id,seed] of Object.entries(incoming.seeds || {}))
                                          win.echoGarden.seeds[id] ||= structuredClone(seed);
                                    }});
      const tab = {win, net, visible:true,
                   plant: (id,x) => net.dispatch({op:'plant',id,owner:String(win.clientID),color:0,pos:[x,1.5,GARDEN.z]}),
                   seeds: () => Object.keys(win.echoGarden.seeds).sort().join(',')};
      tabs.push(tab);
      return tab;
   };
   const timer = setInterval(() => tabs.forEach(t => t.visible && t.net.frame()), 14);   // requestAnimationFrame
   return {open, stop: () => clearInterval(timer)};
}

test('a hidden tab receives every message, not only the last batch', async () => {
   const net = network(), A = net.open(); await wait(60);
   const B = net.open(); await wait(150);
   B.visible = false;
   A.plant('a1',-.2); await wait(40); A.plant('a2',0); await wait(40); A.plant('a3',.2); await wait(100);
   B.visible = true; await wait(100);
   net.stop();
   assert.equal(B.seeds(),'a1,a2,a3');
});

test('two pages receive distinct server-assigned player IDs', async () => {
   const net = network(), A = net.open(), B = net.open();
   await wait(100);
   net.stop();
   assert.notEqual(A.win.clientID,B.win.clientID);
   assert.deepEqual([A.win.clientID,B.win.clientID],[0,1]);
});

test('a late joiner receives a snapshot when the first scene tab runs a background sync tick', async () => {
   const net = network(), A = net.open(); await wait(60);
   A.plant('first',0); await wait(80);
   A.visible = false;
   const B = net.open(); await wait(80);
   assert.equal(B.seeds(),'');
   A.net.frame();                                    // the scene's background timer
   await wait(80);
   B.net.frame();
   net.stop();
   assert.equal(B.seeds(),'first');
});

test('a late joiner gets old notes even when the oldest browser tab is not in the scene', async () => {
   const net = network(), idle = net.open(); await wait(60);
   idle.visible = false;                              // connected to server, but not running Echo Garden
   const A = net.open(); await wait(80);
   A.plant('first',0); await wait(80);
   const B = net.open(); await wait(180);
   net.stop();
   assert.equal(B.seeds(),'first');
});

test('a note planted while the master tab is hidden survives its next snapshot', async () => {
   const net = network(), A = net.open(); await wait(60);
   const B = net.open(); await wait(150);
   A.visible = false;                                  // A is the master client
   B.plant('b1',-.1); await wait(40); B.plant('b2',.1); await wait(100);
   A.visible = true; await wait(3300);                 // past A's 3 s snapshot broadcast
   net.stop();
   assert.equal(A.seeds(),'b1,b2');
   assert.equal(B.seeds(),'b1,b2');
});

test('my newest note is put back when an older snapshot replaces my state', async () => {
   const net = network(), A = net.open(); await wait(60);
   const B = net.open(); await wait(150);
   const old = JSON.parse(JSON.stringify(B.win.echoGarden));
   B.plant('b1',0);
   B.win.echoGarden = old;                             // a snapshot sent before the master saw b1
   B.net.frame();
   net.stop();
   assert.equal(B.seeds(),'b1');
});

test('moves and removes from both tabs end in the same garden', async () => {
   const net = network(60), A = net.open(); await wait(100);
   const B = net.open(); await wait(200);
   A.plant('a',-.3); B.plant('b',.3); await wait(150);
   for (let i = 0; i < 10; i++) {
      A.net.dispatch({op:'move',id:'b',pos:[.3,1.2+i*.05,GARDEN.z]});
      B.net.dispatch({op:'move',id:'a',pos:[-.3,1.2+i*.05,GARDEN.z]});
      await wait(16);
   }
   B.net.dispatch({op:'remove',id:'a'}); await wait(300);
   net.stop();
   assert.deepEqual(A.win.echoGarden, B.win.echoGarden);
   assert.equal(A.seeds(),'b');
});

test('the garden turns off the 3 s full-state broadcast, and dispose turns it back on', async () => {
   const net = network(), A = net.open(); await wait(60);
   const B = net.open(); await wait(150);
   const broadcasts = [];
   const send = A.win.server.broadcastGlobal;
   A.win.server.broadcastGlobal = name => { broadcasts.push(name); send(name); };
   await wait(3300);                                   // A is the master client
   assert.equal(broadcasts.includes('echoGarden'),false);
   A.net.dispose();
   await wait(3300);
   net.stop();
   assert.equal(broadcasts.includes('echoGarden'),true);
});
