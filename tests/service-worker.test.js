import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { managerDestination } from "../portal/destination.js";
const scope = "https://example.test/marcolin/harleydavidson/";
async function setup() {
  const handlers = {}, entries = new Map(), calls = [], navigations = [];
  function makeCache() {
    const data = new Map();
    return {
      async addAll(urls) { for(const url of urls) data.set(url,new Response("precache")); },
      async put(req, res) { await new Promise(resolve=>setTimeout(resolve,1)); data.set(typeof req === 'string' ? req : req.url,res.clone()); },
      async match(req, opts) { const key=typeof req === 'string' ? req : req.url; for(const [url,res] of data) if(url===key || opts?.ignoreSearch && url.split('?')[0]===key.split('?')[0]) return res.clone(); },
      async keys() { return [...data.keys()]; },
      async delete(key) { return data.delete(key); }
    };
  }
  const caches = { async keys(){return [...entries.keys()];}, async delete(key){return entries.delete(key);}, async open(key){if(!entries.has(key))entries.set(key,makeCache());return entries.get(key);} };
  let offline = false;
  const self = { registration:{scope}, addEventListener(type,fn){handlers[type]=fn;}, async skipWaiting(){calls.push('skipWaiting');}, clients:{ async claim(){calls.push('claim');}, async matchAll(){return [scope+'?old=1','https://example.test/marcolin/worldcup/'].map(url=>({url,async navigate(to){navigations.push(to);}}));} } };
  const sandbox = {self,caches,URL,AbortController,setTimeout,clearTimeout,fetch:async(req,options)=>{calls.push({url:typeof req==='string'?req:req.url,options});if(offline)throw new Error('offline');return new Response('network');}};
  vm.runInNewContext(await readFile("harleydavidson/sw.js","utf8"), sandbox);
  async function lifecycle(type){let promise;handlers[type]({waitUntil:p=>promise=p});await promise;}
  async function request(url,method='GET'){let promise;handlers.fetch({request:new Request(url,{method}),respondWith:p=>promise=p});return promise;}
  return {caches,calls,navigations,lifecycle,request,setOffline:value=>offline=value};
}
test("service worker migrates only locator caches and reloads only locator clients",async()=>{
  const s=await setup();
  for(const key of ['hd-eyewear-shell-v4','hd-eyewear-tiles-v4','worldcup-assets','hd-eyewear-directory-v1'])await s.caches.open(key);
  await s.lifecycle('install'); await s.lifecycle('activate');
  assert.deepEqual(s.navigations,[scope+'?old=1']);
  const keys=await s.caches.keys();
  assert.ok(keys.includes('worldcup-assets')); assert.ok(keys.includes('hd-eyewear-directory-v1'));
  assert.ok(!keys.includes('hd-eyewear-shell-v4'));
  await s.lifecycle('activate'); assert.equal(s.navigations.length,1);
});
test("service worker never precaches or returns a cached mutable directory",async()=>{
  const s=await setup();await s.lifecycle('install');
  const cache=await s.caches.open('hd-locator-marcolin-shell-v5');
  assert.ok(!(await cache.keys()).some(url=>url.includes('locations.json')));
  assert.equal(await (await s.request(scope+'data/locations.json?fresh=1')).text(),'network');
  assert.equal(s.calls.at(-1).options.cache,'no-store');
  s.setOffline(true);await assert.rejects(s.request(scope+'data/locations.json?fresh=2'),/offline/);
});
test("service worker awaits updated shell writes and leaves authentication alone",async()=>{
  const s=await setup();await s.lifecycle('install');
  assert.equal(await (await s.request(scope+'js/main.js')).text(),'network');
  s.setOffline(true);
  assert.equal(await (await s.request(scope+'js/main.js?cachebuster=1')).text(),'network');
  assert.equal(await s.request('https://example.test/api/locations'),undefined);
  assert.equal(await s.request('https://example.test/auth/github'),undefined);
  assert.equal(await s.request('https://example.test/api/locations','PUT'),undefined);
});
test("retired portal destination fails closed and accepts only an HTTPS origin",()=>{
  assert.equal(managerDestination('https://manager.example.test'),'https://manager.example.test/');
  for(const value of ['', 'javascript:alert(1)','http://manager.test','https://user:pass@manager.test','https://manager.test/?token=example','https://manager.test/other']) assert.equal(managerDestination(value),null);
});
