import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('artifacts', { recursive: true });
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl']});
const url=pathToFileURL(resolve('index.html')).href;
const errors=[];
// Exercise the actual collision functions without GPU timing.
const source=await readFile('index.html','utf8');
const mathSource=source.slice(source.indexOf('function ringSupport('),source.indexOf('function zoneAt('));
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const {walkAllowed,walkMove}=new Function('TAU','INNER','OUTER','WALL','WALK_R','EYE_Y','dot','sub',mathSource+'return {walkAllowed,walkMove};')(2*Math.PI,4.70,5.70,.075,.095,.12,dot,sub);
const doors=[{z:5.69,open:0},{z:-5.69,open:0},{z:6.70,exit:true,open:0}];
const obstacles=[{p:[.49,-.22,-7.25],s:[.29,.38,.75],axes:null}];
let point=walkMove([0,.12,6.32],[0,0,-2],doors,obstacles);
assert.ok(point[2]>5.82,'Closed airlock blocks movement even across a large time step');
doors[0].open=1;point=walkMove(point,[0,0,-.6],doors,obstacles);
assert.ok(point[2]<5.4,'Open door allows entering habitat');
for(let i=0;i<240;i++){const t=i*2*Math.PI/240;assert.ok(walkAllowed([5.2*Math.cos(t),.12,5.2*Math.sin(t)],doors,obstacles),'Habitat centerline is continuous');}
assert.equal(walkAllowed([0,.12,0],doors,obstacles),false);
assert.equal(walkAllowed([0,.12,7],doors,obstacles),false);
point=walkMove([0,.12,-5.2],[0,0,-3],doors,obstacles);assert.ok(point[2]>-5.57);
doors[1].open=1;point=walkMove([0,.12,-5.2],[0,0,-2.2],doors,obstacles);assert.ok(point[2]<-7);
point=walkMove(point,[2,0,0],doors,obstacles);assert.ok(point[0]<.26,'Lab bench blocks movement');
console.log('PASS: connected habitat, door gating, hull and equipment collisions');
const movementSource=source.slice(source.indexOf('function logMovement('),source.indexOf('function logFps('));
const movementSession={active:true,distance:{inside:0,free:0}},visibility={hidden:false};
const logMovement=new Function('session','document','sub',movementSource+'return logMovement;')(movementSession,visibility,sub);
logMovement('interior',[0,0,0],[.3,0,.4]);
assert.deepEqual(movementSession.distance,{inside:.5,free:0});
logMovement('interior',[.3,0,.4],[.3,0,.4]);
assert.equal(movementSession.distance.inside,.5);
logMovement('free',[0,0,0],[1,2,2]);
assert.equal(movementSession.distance.free,3);
movementSession.active=false;
logMovement('interior',[0,0,0],[10,0,0]);
assert.equal(movementSession.distance.inside,.5);
movementSession.active=true;visibility.hidden=true;
logMovement('free',[0,0,0],[10,0,0]);
assert.equal(movementSession.distance.free,3);
visibility.hidden=false;
logMovement('orbit',[0,0,0],[10,0,0]);
logMovement('interior',[0,0,0],[NaN,0,0]);
assert.deepEqual(movementSession.distance,{inside:.5,free:3});
console.log('PASS: distance keys, real movement, collision, pause and invalid coordinate handling');
// Pure regression tests for the production algorithms, without GPU timing.
function productionFunction(name,next,args=[],values=[]){
  const a=source.indexOf('function '+name+'('),b=source.indexOf('function '+next+'(',a+1);
  assert.ok(a>=0&&b>a,name+' extraction');
  return new Function(...args,source.slice(a,b)+'return '+name+';')(...values);
}
const shaderVariant=productionFunction('optimizedEarthSource','sceneProgram');
const referenceShader=source.slice(source.indexOf('const fs=`')+10,source.indexOf('function shader(')).split('`;')[0];
const optimizedShader=shaderVariant(referenceShader);
assert.notEqual(optimizedShader,referenceShader);
assert.ok(optimizedShader.includes('if(uHasDay>.5)')&&optimizedShader.includes('if(uHasCloud>.5)')&&optimizedShader.includes('if(uHasNight>.5)'));
assert.ok(!optimizedShader.includes('mix(synthetic,')&&!optimizedShader.includes('mix(fallbackCloud,'));
assert.throws(()=>shaderVariant('invalid'));
const powerPolicy=productionFunction('powerPolicy','equipmentAvailable');
const equipmentAvailable=productionFunction('equipmentAvailable','stats');
assert.equal(powerPolicy('normal',0,-1),'emergency');
assert.equal(powerPolicy('normal',1,-1),'normal');
assert.equal(powerPolicy('normal',0,0),'normal');
assert.equal(powerPolicy('emergency',0,1),'normal');
assert.equal(powerPolicy('emergency',4.99,-1),'emergency');
assert.equal(powerPolicy('emergency',5,-1),'normal');
assert.equal(equipmentAvailable('lab','emergency'),false);
assert.equal(equipmentAvailable('lab','normal'),true);
assert.equal(equipmentAvailable('life','emergency'),true);
assert.equal(equipmentAvailable('systems','emergency'),true);
const doorDecision=productionFunction('doorDecision','interactInterior');
assert.equal(doorDecision({exit:true},{want:true,open:0},[0,.12,6.32]),'inner_door_open');
assert.equal(doorDecision({exit:true},{want:false,open:.05},[0,.12,6.32]),'inner_door_open');
assert.equal(doorDecision({exit:true},{want:false,open:0},[0,.12,6.32]),null);
assert.equal(doorDecision({exit:false,want:true,z:5.69},{},[0,.12,5.70]),'doorway_occupied');
assert.equal(doorDecision({exit:false,want:true,z:5.69},{},[0,.12,6.32]),null);
const dockingGuide=productionFunction('dockingGuide','updateDockGuide',['dot'],[dot]);
let guide=dockingGuide([-4,-2,1],[-1,0,0],false,false);
assert.equal(guide.axis,0);assert.equal(guide.dir,-1);assert.ok(guide.closing>0);
assert.equal(dockingGuide([1,0,0],[1,0,0],false,false).brake,true);
assert.equal(dockingGuide([5,0,0],[-1,0,0],false,false).brake,true);
assert.equal(dockingGuide([.2,0,0],[.1,0,0],false,false).ready,true);
assert.equal(dockingGuide([.2,0,0],[.6,0,0],false,false).ready,false);
assert.equal(dockingGuide([0,0,0],[0,0,0],true,false).closing,0);
const advance=productionFunction('advancePerformanceWindow','recordPerformance');
const a={mode:'orbit',zone:null,render_width:720},b={mode:'interior',zone:'HAB',render_width:720};
let w=null,result;
for(let i=0;i<=50;i++){result=advance(w,i*20,a);w=result.window;}
assert.equal(result.sample.fps,50);assert.equal(result.sample.frames,50);assert.equal(result.sample.mixed_context,false);
for(let i=51;i<=100;i++){result=advance(w,i*20,i<75?a:b);w=result.window;}
assert.equal(result.sample.mixed_context,true);assert.deepEqual(result.sample.start_context,a);assert.deepEqual(result.sample.end_context,b);
result=advance(null,10000,b);assert.equal(result.sample,null);
result=advance(result.window,11000,b);assert.equal(result.sample.fps,1);assert.equal(result.sample.mixed_context,false);
// Check the actual equipment action: rejecting a lab scan must not increment tasks or counters.
const interactionState={inside:true,hatchTransit:null,freePos:[0,.12,-7.25],powerMode:'emergency',insideDone:{lab:false},labScan:0};
const interactionEvents=[];
const interact=productionFunction('interactInterior','updateCabin',
 ['state','findInteraction','equipmentAvailable','logEvent','vecLog','showNotice'],
 [interactionState,()=>({station:{id:'lab'}}),equipmentAvailable,(type,data)=>interactionEvents.push({type,data}),v=>v.slice(),()=>{}]);
interact();
assert.equal(interactionState.labScan,0);assert.equal(interactionState.insideDone.lab,false);
assert.equal(interactionEvents[0].data.result,'rejected');assert.equal(interactionEvents[0].data.reason,'insufficient_power');
interactionState.powerMode='normal';interact();
assert.equal(interactionState.labScan,1);assert.equal(interactionState.insideDone.lab,true);
assert.equal(interactionEvents[1].data.result,'accepted');
console.log('PASS: contextual performance windows, door decision rules, docking guidance and emergency policy');
const planesOf=productionFunction('frustumPlanes','sphereVisible');
const visible=productionFunction('sphereVisible','bindMesh');
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],planes=planesOf(identity);
assert.equal(planes.length,6);
for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  const p=[0,0,0];p[axis]=sign*1.2;
  assert.equal(visible(planes,p,.1),false);
  assert.equal(visible(planes,p,.25),true);
  p[axis]=sign*1.1;assert.equal(visible(planes,p,.1),true);
}
assert.equal(visible(null,[100,100,100],0),true);
const perspective=productionFunction('perspective','view');
const persp=planesOf(perspective(Math.PI/3,1.5,.1,100));
assert.equal(visible(persp,[0,0,-10],1),true);
assert.equal(visible(persp,[0,0,10],1),false);
assert.equal(visible(persp,[0,0,-101],.1),false);
assert.equal(visible(persp,[0,0,-.05],.1),true);
for(let z=1;z<90;z+=3){const y=z*Math.tan(Math.PI/6),x=y*1.5;assert.equal(visible(persp,[x*.99,y*.99,-z],0),true);assert.equal(visible(persp,[x*1.1,0,-z],0),false);}
const mayThrust=productionFunction('mayThrust','syncDockControls');
assert.equal(mayThrust(true,true),false);assert.equal(mayThrust(false,false),false);assert.equal(mayThrust(true,false),true);
let m=advance(null,0,a).window;
m=advance(m,500,a,{draw_calls:20,cpu_submit_ms:5}).window;
const mr=advance(m,1000,a,{draw_calls:40,cpu_submit_ms:7}).sample;
assert.deepEqual(mr.render_metrics,{draw_calls:30,cpu_submit_ms:6});assert.equal(mr.render_metric_frames,2);
console.log('PASS: conservative frustum bounds, docking latch guard and render counter aggregation');
const closedDoors=[{z:5.69,open:0}];
for(const dt of [1/144,1/60,1/30,.12]){
  const sim={inside:true,hatchTransit:null,freePos:[0,.12,6.32]};
  const log={active:true,lastCollision:-Infinity},records=[];let now=0;
  const move=productionFunction('moveFree','freeMotion',
    ['state','walkMove','cabinDoors','cabinObstacles','session','performance','logEvent','vecLog','logZone','roundLog','logMovement'],
    [sim,walkMove,closedDoors,[],log,{now:()=>now},(type,data)=>records.push({type,data}),v=>v.slice(),()=> 'AIRLOCK',v=>Number(v.toFixed(3)),()=>{}]);
  for(let i=0;i<Math.ceil(2/dt);i++){now+=dt*1000;move([0,0,-.45*dt]);}
  assert.ok(sim.freePos[2]>=5.82-1e-5&&sim.freePos[2]<=5.845+1e-5);
  assert.ok(records.some(e=>e.type==='movement_blocked'&&e.data.zone==='AIRLOCK'&&e.data.actual<e.data.requested));
}
console.log('PASS: actual movement-blocked recorder at four simulation frame cadences');
async function setup(viewport,mobile=false,fallback=false){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.addInitScript(fallback=>{
    const proto=WebGLRenderingContext.prototype, names=new WeakMap();
    if(fallback){const original=proto.getExtension;proto.getExtension=function(name){return name==='ANGLE_instanced_arrays'?null:original.call(this,name);};}
    const get=proto.getUniformLocation,set=proto.uniformMatrix4fv,set3=proto.uniform3fv;
    proto.getUniformLocation=function(program,name){const result=get.call(this,program,name);if(result)names.set(result,name);return result;};
    proto.uniformMatrix4fv=function(location,transpose,value){if(names.get(location)==='uVP')window.__testVP=Array.from(value);return set.call(this,location,transpose,value);};
    proto.uniform3fv=function(location,value){if(names.get(location)==='uEye'){window.__testEye=Array.from(value);window.__testFrame=(window.__testFrame||0)+1;}return set3.call(this,location,value);};
  },fallback);
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#renderStatus').textContent.includes('جاهز'),{},{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#earthStatus').textContent.includes('3/3'),{},{timeout:30000});
  return page;
}
async function matrix(page){await page.waitForFunction(()=>Array.isArray(window.__testVP));return page.evaluate(()=>window.__testVP.slice());}
async function cameraEye(page){await page.waitForFunction(()=>Array.isArray(window.__testEye));return page.evaluate(()=>window.__testEye.slice());}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
async function nextFrame(page){
  const previous=await page.evaluate(()=>window.__testFrame||0);
  await page.waitForFunction(n=>window.__testFrame>n,previous,{timeout:30000});
}
async function waitMatrix(page,expected){
  await page.waitForFunction(expected=>Array.isArray(window.__testVP)&&window.__testVP.every((v,i)=>Math.abs(v-expected[i])<1e-4),expected,{timeout:30000});
}
async function cameraSnapshot(page){
  await nextFrame(page);
  return page.evaluate(()=>({eye:window.__testEye.slice(),matrix:window.__testVP.slice()}));
}
async function checkFree(page,mobile=false){
  // Read the actual camera immediately before the transition, after opening the menu.
  await tab(page,'scene');
  const snapshot=await cameraSnapshot(page),origin=snapshot.eye,orbit=snapshot.matrix;
  await page.locator('#freeCamera').click();
  await nextFrame(page);
  assert.equal(await page.locator('#freeControls').isVisible(),true);
  assert.equal(await page.locator('#panMode').isVisible(),false);
  const entered=await cameraEye(page),entryError=distance(origin,entered);
  console.log('Free flight entry:',page.viewportSize(),{origin,entered,entryError});
  assert.ok(entryError<.001,'Entering free flight preserves camera position');
  await fullCanvas(page);
  if(mobile){
    const touch=await page.context().newCDPSession(page),b=await page.locator('[data-fly="forward"]').boundingBox(),x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await page.waitForTimeout(700);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await page.locator('#gl').focus();await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
  }
  await nextFrame(page);
  const moved=await cameraEye(page);assert.ok(distance(origin,moved)>.15,'Held movement changes camera position');
  await nextFrame(page);assert.ok(distance(moved,await cameraEye(page))<.001,'Camera stops when control is released');
  const orientation=await matrix(page),view=page.viewportSize();
  await page.mouse.move(Math.round(view.width*.35),Math.round(view.height*.40));await page.mouse.down();await page.mouse.move(Math.round(view.width*.35)+40,Math.round(view.height*.40)+20,{steps:5});await page.mouse.up();
  await nextFrame(page);
  const rotated=await matrix(page);assert.ok(distance(orientation.slice(0,12),rotated.slice(0,12))>.01,'Look direction changes');
  assert.ok(distance(moved,await cameraEye(page))<.001,'Looking around does not orbit or translate the camera');
  await page.locator('#freeFaster').click();assert.match(await page.locator('#freeSpeed').textContent(),/12 U\/s/);
  await page.locator('#freeHide').click();assert.equal(await page.locator('#freeControls').isVisible(),false);
  await page.locator('#freeQuick').click();assert.equal(await page.locator('#freeControls').isVisible(),true);
  await page.screenshot({path:'artifacts/free-flight-'+view.width+'.png'});
  await action(page,'freeCamera');await nextFrame(page);
  assert.equal(await page.locator('#freeControls').isVisible(),false);
  assert.ok(distance(origin,await cameraEye(page))<.001,'Exiting free flight restores orbital position');
  assert.ok(distance(orbit,await matrix(page))<.001,'Exiting free flight restores orbital projection');
}
async function checkInterior(page){
  await action(page,'interiorStart');
  await page.waitForFunction(()=>document.querySelector('#interiorZone').textContent.includes('AIRLOCK'));
  await page.waitForFunction(()=>window.__testEye&&Math.abs(window.__testEye[2]-6.32)<.02);
  await fullCanvas(page);
  await page.screenshot({path:'artifacts/interior-airlock.png'});
  await page.locator('#gl').focus();await page.keyboard.down('w');
  // Wait for physical contact, not a fixed wall-clock delay after nearing the door.
  // Slow software-rendered frames cap simulation dt at 0.12 s; 800 ms of wall
  // time need not be enough to cover the remaining distance to the barrier.
  try {
    await page.evaluate(()=>{window.__testDoorContact=null;});
    await page.waitForFunction(()=>{
      const eye=window.__testEye,frame=window.__testFrame;
      if(!eye||!Number.isFinite(frame))return false;
      const z=eye[2],prev=window.__testDoorContact;
      if(prev&&prev.frame===frame)return false;
      const near=z>=5.82-1e-5&&z<=5.845+1e-5;
      const stable=near&&prev&&Math.abs(z-prev.z)<1e-6?prev.stable+1:0;
      window.__testDoorContact={z,frame,stable};
      return stable>=3;
    },null,{timeout:30000});
  } finally {await page.keyboard.up('w');}
  const contact=await cameraEye(page);
  assert.ok(contact[2]>=5.82-1e-5&&contact[2]<=5.845+1e-5,'Closed door stops actual camera at the collision boundary');
  console.log('Closed-door contact:',contact);
  assert.match(await page.locator('#interiorPrompt').textContent(),/فتح/);
  await page.locator('#interiorAction').click();await nextFrame(page);
  // Approach the outer hatch while the inner door is open, then verify the interlock.
  await page.locator('#gl').focus();await page.keyboard.down('s');
  await page.waitForFunction(()=>window.__testEye[2]>6.23,{},{timeout:15000});await page.keyboard.up('s');
  for(let i=0;i<24;i++)await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>document.querySelector('#interiorPrompt').textContent.includes('قبل الخروج'));
  await page.locator('#interiorAction').click();
  assert.match(await page.locator('#gameNotice').textContent(),/أغلق باب العزل الداخلي/);
  assert.equal(await page.locator('#interiorHud').isVisible(),true);
  await page.locator('#gl').focus();for(let i=0;i<24;i++)await page.keyboard.press('ArrowRight');
  await page.keyboard.down('w');
  await page.waitForFunction(()=>window.__testEye[2]<5.43,{},{timeout:15000});await page.keyboard.up('w');
  await page.waitForFunction(()=>document.querySelector('#interiorZone').textContent.includes('HAB'));
  await page.screenshot({path:'artifacts/interior-habitat.png'});
  await action(page,'interiorStart');
  await page.waitForFunction(()=>document.querySelector('#interiorPrompt').textContent.includes('الخروج'));
  await page.locator('#interiorAction').click();
  await page.waitForFunction(()=>document.querySelector('#interiorHud').classList.contains('hidden'),{},{timeout:10000});
  await page.waitForFunction(()=>window.__testEye[2]>7.3);
  await page.locator('#hatchEntry').waitFor({state:'visible'});
  await page.locator('#hatchEntry').click();
  await page.waitForFunction(()=>!document.querySelector('#interiorHud').classList.contains('hidden'));
  await action(page,'freeCamera');
  assert.equal(await page.locator('#interiorHud').isVisible(),false);
}
async function downloadSession(page){
  const downloading=page.waitForEvent('download');
  await page.locator('#sessionExport').click();
  const download=await downloading;
  assert.match(download.suggestedFilename(),/^helios-.*\.json$/);
  const data=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(data.schema,'helios.session.v1');
  assert.equal(data.app.version,'3.4.0');assert.equal(data.app.build,'13');
  assert.ok(data.performance_samples.every(p=>p.render_metric_frames===p.frames&&p.render_metrics&&p.render_metrics.draw_calls>0&&p.render_metrics.culled<=p.render_metrics.objects&&p.render_metrics.cpu_submit_ms>=0));
  assert.ok(Number.isFinite(data.session.summary.distance_units.inside));
  assert.ok(Number.isFinite(data.session.summary.distance_units.free));
  assert.deepEqual(Object.keys(data.session.summary.distance_units).sort(),['free','inside']);
  assert.equal(data.session.summary.retained_events,data.events.length);
  assert.equal(data.session.summary.retained_samples,data.samples.length);
  assert.equal(data.session.summary.retained_performance_samples,data.performance_samples.length);
  assert.equal(data.session.summary.performance.fps_samples,data.performance_samples.length+data.session.summary.dropped.performance_samples);
  assert.ok(data.performance_samples.every(p=>p.duration_ms>=1000&&Number.isFinite(p.fps)&&p.frames>0&&p.start_context.render_width>0&&p.end_context.render_height>0&&typeof p.mixed_context==='boolean'));
  assert.ok(data.events.every((e,i)=>i===0||e.seq>data.events[i-1].seq));
  assert.ok(data.samples.every(s=>s.camera.position.every(Number.isFinite)));
  assert.ok(data.performance_samples.every(p=>['reference','optimized'].includes(p.start_context.earth_shader)&&p.start_context.earth_maps&&p.render_metrics.earth_mesh_draws>=0));
  assert.ok(data.environment.earth_maps.day);
  return data;
}
async function checkSession(page){
  await tab(page,'session');
  await page.locator('#sessionNotes').fill('اختبار سجل التجربة');
  const first=await downloadSession(page);
  await writeFile('artifacts/test-session-before-reset.json',JSON.stringify(first,null,2));
  assert.equal(first.notes,'اختبار سجل التجربة');
  assert.ok(first.samples.length>0);
  assert.ok(first.events.some(e=>e.type==='session_started'));
  assert.ok(first.events.some(e=>e.type==='interior_enter'));
  assert.ok(first.events.some(e=>e.type==='interior_exit'));
  assert.ok(first.events.some(e=>e.type==='door_interaction'&&e.data.result==='accepted'));
  assert.ok(first.events.some(e=>e.type==='door_interaction'&&e.data.result==='rejected'&&e.data.reason==='inner_door_open'));
  assert.ok(first.events.some(e=>e.type==='door_state'&&e.data.result==='completed'));
  assert.ok(first.performance_samples.some(p=>p.start_context.mode==='interior'||p.end_context.mode==='interior'));
  const blocked=first.events.filter(e=>e.type==='movement_blocked');
  console.log('Recorded blocked movements:',blocked);
  assert.ok(blocked.some(e=>e.data.zone==='AIRLOCK'&&e.data.requested>0&&e.data.actual<e.data.requested),'Export includes actual blocked motion at the airlock');
  console.log('Session movement:',first.session.summary.distance_units);
  assert.ok(first.session.summary.distance_units.inside>=.89,'Interior walk from airlock to habitat records actual displacement');
  assert.ok(first.session.summary.distance_units.free>0,'Free flight records actual displacement');
  assert.ok(first.session.summary.performance.fps_samples>0);
  await page.locator('#sessionToggle').click();
  const paused=await downloadSession(page);
  assert.equal(paused.session.recording_active,false);
  await close(page);await action(page,'recenter');await tab(page,'session');
  const later=await downloadSession(page);
  assert.deepEqual(later.events,paused.events);
  assert.deepEqual(later.samples,paused.samples);
  assert.deepEqual(later.performance_samples,paused.performance_samples);
  assert.deepEqual(later.session.summary.distance_units,paused.session.summary.distance_units);
  await page.locator('#sessionToggle').click();
  await page.waitForFunction(()=>document.querySelector('#sessionToggle').getAttribute('aria-pressed')==='true');
  const resumed=await downloadSession(page);
  assert.ok(resumed.events.some(e=>e.type==='recording_resumed'));
  page.once('dialog',d=>d.accept());
  await page.locator('#sessionNew').click();
  const fresh=await downloadSession(page);
  assert.notEqual(fresh.session.id,first.session.id);
  assert.equal(fresh.notes,'');
  assert.deepEqual(fresh.session.summary.distance_units,{inside:0,free:0});
  assert.equal(fresh.events[0].type,'session_started');
  assert.equal(fresh.session.summary.event_counts.interior_enter,undefined);
  await close(page);
}
function checkPan(before,after,dx,dy,viewport){
  assert.ok(before.slice(0,12).every((v,i)=>Math.abs(v-after[i])<1e-5),'Pan preserves rotation and projection');
  const project=m=>[viewport.width*(.5+.5*m[12]/m[15]),viewport.height*(.5-.5*m[13]/m[15])];
  const a=project(before),b=project(after);
  assert.ok(Math.abs(b[0]-a[0]-dx)<3,'Horizontal screen displacement matches gesture');
  assert.ok(Math.abs(b[1]-a[1]-dy)<3,'Vertical screen displacement matches gesture');
}
async function capturePixels(page){
  return page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{
    const c=document.querySelector('#gl'),g=c.getContext('webgl'),b=new Uint8Array(c.width*c.height*4);
    g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,b);
    let lit=0;for(let i=0;i<b.length;i+=4)if(b[i]+b[i+1]+b[i+2]>65)lit++;
    resolve({lit,total:c.width*c.height,error:g.getError(),width:c.width,height:c.height});
  })));
}
// Compare actual rendered pixels of both shader programs in the same paused scene.
async function compareEarthShaders(page){
  await action(page,'play');await close(page);
  await tab(page,'settings');await page.locator('#quality').selectOption('cinema');
  await page.locator('#camera').selectOption('planet');await close(page);
  await page.waitForTimeout(2600);
  assert.equal(await page.locator('#earthShader').isDisabled(),false);
  async function capture(mode,save){
    await tab(page,'settings');await page.locator('#earthShader').selectOption(mode);await close(page);
    await nextFrame(page);await nextFrame(page);
    return page.evaluate(save=>new Promise(resolve=>requestAnimationFrame(()=>{
      const c=document.querySelector('#gl'),g=c.getContext('webgl'),b=new Uint8Array(c.width*c.height*4);
      g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,b);
      const error=g.getError();
      if(save){window.__earthReference=b;resolve({error,width:c.width,height:c.height});return;}
      const a=window.__earthReference;let sum=0,large=0,lit=0;for(let i=0;i<b.length;i+=4){let max=0;for(let k=0;k<3;k++){const d=Math.abs(b[i+k]-a[i+k]);sum+=d;max=Math.max(max,d);}if(max>8)large++;if(b[i]+b[i+1]+b[i+2]>65)lit++;}
      resolve({error,mean:sum/(b.length*.75),fraction:large/(b.length/4),lit,total:b.length/4,sameSize:a.length===b.length});
    })),save);
  }
  const first=await capture('reference',true);assert.equal(first.error,0);
  await page.screenshot({path:'artifacts/earth-shader-reference.png'});
  const second=await capture('optimized',false);assert.equal(second.error,0);assert.ok(second.sameSize&&second.lit>second.total*.015);
  console.log('EARTH SHADER A/B',second);
  assert.ok(second.mean<=1&&second.fraction<=.01,'Earth shader visual regression '+JSON.stringify(second));
  await page.screenshot({path:'artifacts/earth-shader-optimized.png'});
  await page.waitForTimeout(2200);
  await tab(page,'session');const data=await downloadSession(page);
  assert.ok(data.events.some(e=>e.type==='earth_shader_changed'&&e.data.value==='reference'));
  assert.ok(data.performance_samples.some(p=>!p.mixed_context&&p.start_context.earth_shader==='optimized'&&p.start_context.earth_maps.day==='ready'&&p.render_metrics.earth_mesh_draws>0));
  await tab(page,'settings');await page.locator('#quality').selectOption('auto');await page.locator('#camera').selectOption('orbit');await close(page);
  await action(page,'play');await close(page);
}
async function compareRenderPaths(page,fallback=false){
  await action(page,'play');await close(page);
  await tab(page,'settings');await page.locator('#quality').selectOption('cinema');
  for(const mode of ['reference','optimized','balanced']){
    await tab(page,'settings');await page.locator('#renderMode').selectOption(mode);
    await close(page);await page.waitForTimeout(2600);
    const px=await capturePixels(page);assert.equal(px.error,0);assert.ok(px.lit>px.total*.015);
    await page.screenshot({path:'artifacts/render-'+(fallback?'fallback-':'')+mode+'.png'});
  }
  await tab(page,'session');const data=await downloadSession(page);
  const sample=mode=>data.performance_samples.filter(p=>!p.mixed_context&&!p.start_context.menu_open&&p.start_context.quality==='cinema'&&p.start_context.render_mode===mode).at(-1);
  const ref=sample('reference'),opt=sample('optimized'),bal=sample('balanced');
  assert.ok(ref&&opt&&bal,'Stable windows for all three render modes');
  assert.equal(ref.start_context.render_width,opt.start_context.render_width);
  assert.equal(ref.start_context.render_height,opt.start_context.render_height);
  assert.equal(ref.render_metrics.culled,0);assert.equal(ref.render_metrics.instances,0);assert.equal(ref.render_metrics.lod_objects,0);
  assert.equal(opt.render_metrics.lod_objects,0);assert.ok(opt.render_metrics.culled>0);
  assert.ok(opt.render_metrics.draw_calls<ref.render_metrics.draw_calls);
  if(fallback)assert.equal(opt.render_metrics.instances,0);
  else if(opt.start_context.instancing_available)assert.ok(opt.render_metrics.instances>0);
  assert.ok(bal.render_metrics.lod_objects>0);
  assert.ok(bal.render_metrics.mesh_triangles<=opt.render_metrics.mesh_triangles);
  console.log('RENDER A/B',fallback,{reference:ref.render_metrics,optimized:opt.render_metrics,balanced:bal.render_metrics});
  await tab(page,'settings');await page.locator('#renderMode').selectOption('optimized');await page.locator('#quality').selectOption('auto');await close(page);
  await action(page,'play');await close(page);
}
async function fullCanvas(page){
  const b=await page.evaluate(()=>{
    const r=document.querySelector('#gl').getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height,iw:innerWidth,ih:innerHeight,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,touch:getComputedStyle(document.querySelector('#gl')).touchAction};
  });
  assert.ok(Math.abs(b.x)<=1&&Math.abs(b.y)<=1,'Canvas origin is viewport origin');
  assert.ok(Math.abs(b.w-b.iw)<=1&&Math.abs(b.h-b.ih)<=1,'Canvas fills viewport');
  assert.ok(b.docW<=b.iw+1&&b.docH<=b.ih+1,'No document scroll');
  assert.equal(b.touch,'none','Canvas receives free 3D touch gestures');
}
async function tab(page,name){
  if(!await page.locator('#commandPanel').isVisible())await page.locator('#menuOpen').click();
  await page.locator('[data-page="'+name+'"]').click();
  assert.equal(await page.locator('[data-page="'+name+'"]').getAttribute('aria-pressed'),'true');
}
async function close(page){
  if(await page.locator('#commandPanel').isVisible())await page.locator('#menuClose').click();
}
async function action(page,id){await tab(page,'scene');await page.locator('#'+id).click();}
async function range(page,id,v){await tab(page,'systems');await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);}
try{
  const page=await setup({width:1366,height:850});
  await fullCanvas(page);
  assert.equal(await page.locator('#commandPanel').isVisible(),false);
  assert.equal(await page.locator('#flightPanel').isVisible(),false);
  assert.equal(await page.locator('#labels').isVisible(),false);
  await page.waitForTimeout(400);
  const pixels=await page.evaluate(()=>{
    const c=document.querySelector('#gl'),g=c.getContext('webgl');
    return new Promise(resolve=>requestAnimationFrame(()=>{
      const w=c.width,h=c.height,b=new Uint8Array(w*h*4);g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,b);let lit=0,bright=0;for(let i=0;i<b.length;i+=4){if(b[i]+b[i+1]+b[i+2]>65)lit++;if(b[i]+b[i+1]+b[i+2]>300)bright++;}resolve({lit,bright,total:w*h,error:g.getError()});
    }));
  });
  console.log('Framebuffer:',pixels);assert.equal(pixels.error,0);assert.ok(pixels.lit>pixels.total*.015);assert.ok(pixels.bright>100);
  await page.screenshot({path:'artifacts/desktop.png'});
  await compareRenderPaths(page);
  const beforePan=await matrix(page);
  await page.locator('#panMode').click();
  assert.equal(await page.locator('#panMode').getAttribute('aria-pressed'),'true');
  await page.mouse.move(500,350);await page.mouse.down();await page.mouse.move(590,410,{steps:6});await page.mouse.up();
  await page.waitForTimeout(300);checkPan(beforePan,await matrix(page),90,60,{width:1366,height:850});
  await page.screenshot({path:'artifacts/pan-desktop.png'});
  await action(page,'recenter');await waitMatrix(page,beforePan);
  const centered=await matrix(page);assert.ok(beforePan.every((v,i)=>Math.abs(v-centered[i])<1e-4),'Recenter restores the original view');
  await page.locator('#panMode').click();assert.equal(await page.locator('#panMode').getAttribute('aria-pressed'),'false');
  await checkFree(page);
  await checkInterior(page);
  await checkSession(page);
  await tab(page,'units');
  assert.equal(await page.locator('#modules button').count(),6);
  assert.equal(await page.locator('#progress').textContent(),'0 / 4');
  await page.locator('#modules button').nth(0).click();await page.locator('#detail button').click();
  await page.locator('#modules button').nth(1).click();await page.locator('#detail button').click();
  assert.equal(await page.locator('#progress').textContent(),'2 / 4');
  await range(page,'light',100);
  await page.waitForFunction(()=>document.querySelector('#progress').textContent==='3 / 4');
  await page.screenshot({path:'artifacts/systems.png'});
  await action(page,'tour');assert.equal(await page.locator('#tour').getAttribute('aria-pressed'),'true');await action(page,'tour');
  await action(page,'explode');await page.waitForFunction(()=>document.querySelector('#progress').textContent==='4 / 4');
  await action(page,'paths');assert.equal(await page.locator('#paths').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:'artifacts/exploded.png'});
  await range(page,'light',0);await page.waitForFunction(()=>document.querySelector('#generation').textContent==='36 kW');
  assert.match(await page.locator('#warning').textContent(),/عجز/);
  await range(page,'demand',100);await range(page,'speed',4);
  await page.waitForFunction(()=>document.querySelector('#powerStatus').dataset.mode==='emergency',{},{timeout:120000});
  assert.equal(await page.locator('#battery').textContent(),'0.0%');
  assert.match(await page.locator('#powerStatus').textContent(),/المختبر متوقف/);
  await page.screenshot({path:'artifacts/emergency-power.png'});
  await range(page,'light',100);
  await page.waitForFunction(()=>document.querySelector('#powerStatus').dataset.mode==='normal');
  await tab(page,'session');const energyLog=await downloadSession(page);
  assert.ok(energyLog.events.some(e=>e.type==='power_mode'&&e.data.to==='emergency'));
  assert.ok(energyLog.events.some(e=>e.type==='power_mode'&&e.data.to==='normal'));
  await action(page,'play');const battery=await page.locator('#battery').textContent();await page.waitForTimeout(500);assert.equal(await page.locator('#battery').textContent(),battery);
  await tab(page,'mission');await page.locator('#restart').click();assert.equal(await page.locator('#progress').textContent(),'0 / 4');
  await tab(page,'settings');await page.locator('#quality').selectOption('cinema');await close(page);await page.waitForTimeout(300);await page.screenshot({path:'artifacts/cinema.png'});
  await tab(page,'settings');await page.locator('#quality').selectOption('low');
  await tab(page,'flight');await page.locator('#pilot').click();assert.equal(await page.locator('#pilot').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#commandPanel').isVisible(),false);
  await fullCanvas(page);
  await page.waitForFunction(()=>document.querySelector('#dockVector').textContent.includes('X-'));
  assert.equal(await page.locator('.flightGrid button.recommended').count(),1);
  await page.locator('#precision').click();assert.equal(await page.locator('#precision').getAttribute('aria-pressed'),'true');
  await page.locator('#precision').click();assert.equal(await page.locator('#precision').getAttribute('aria-pressed'),'false');
  await page.locator('#flightCollapse').click();assert.equal(await page.locator('#flightPanel').isVisible(),false);await page.locator('#pilotQuick').click();assert.equal(await page.locator('#flightPanel').isVisible(),true);
  await page.locator('#autodock').click();await page.waitForFunction(()=>document.querySelector('#flightMessage').textContent.includes('التحام ناجح'),{},{timeout:60000});
  await page.screenshot({path:'artifacts/docking.png'});
  assert.equal(await page.locator('#undock').isVisible(),true);
  assert.ok(await page.locator('[data-axis]').first().isDisabled());
  assert.ok(await page.locator('#autodock').isDisabled());
  // Even synthetic held input cannot release a docked craft.
  await page.locator('[data-axis]').first().dispatchEvent('keydown',{key:' ',repeat:false});
  await page.waitForTimeout(400);
  assert.match(await page.locator('#flightMessage').textContent(),/التحام ناجح/);
  await tab(page,'session');const firstDock=await downloadSession(page);
  assert.equal(firstDock.events.filter(e=>e.type==='shuttle_docked').length,1);
  await close(page);await page.locator('#undock').click();
  assert.equal(await page.locator('[data-axis]').first().isDisabled(),false);
  await page.locator('#autodock').click();
  await page.waitForFunction(()=>document.querySelector('#flightMessage').textContent.includes('التحام ناجح'),{},{timeout:60000});
  await tab(page,'session');const secondDock=await downloadSession(page);
  const docks=secondDock.events.filter(e=>e.type==='shuttle_docked');
  assert.equal(docks.length,2);assert.notEqual(docks[0].data.attempt,docks[1].data.attempt);
  assert.ok(secondDock.events.some(e=>e.type==='shuttle_undocked'));
  await close(page);
  for(const view of ['top','planet','sun']){
    await tab(page,'settings');await page.locator('#camera').selectOption(view);await page.waitForTimeout(1000);
    assert.equal(await page.locator('#pilot').getAttribute('aria-pressed'),'false');
    await page.screenshot({path:'artifacts/'+view+'.png'});
  }
  await page.close();
  for(const [name,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:760,height:360}]]){
    const mobile=await setup(viewport,true);
    await fullCanvas(mobile);
    await mobile.screenshot({path:'artifacts/'+name+'.png'});
    const before=await matrix(mobile);
    await mobile.locator('#panMode').click();
    const touch=await mobile.context().newCDPSession(mobile);
    const sx=Math.round(viewport.width*.32),sy=Math.round(viewport.height*.40);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
    for(let i=1;i<=5;i++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+i*7,y:sy+i*5,id:1}]});await mobile.waitForTimeout(25);}
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await mobile.waitForTimeout(300);checkPan(before,await matrix(mobile),35,25,viewport);
    await mobile.screenshot({path:'artifacts/'+name+'-pan.png'});
    await action(mobile,'recenter');await waitMatrix(mobile,before);await mobile.locator('#panMode').click();
    await nextFrame(mobile);
    const beforePair=await matrix(mobile);
    const tx=Math.round(viewport.width*.30),ty=Math.round(viewport.height*.42);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1},{x:tx+70,y:ty,id:2}]});
    for(let i=1;i<=5;i++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+i*6,y:ty-i*4,id:1},{x:tx+70+i*6,y:ty-i*4,id:2}]});await mobile.waitForTimeout(25);}
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await mobile.waitForTimeout(300);checkPan(beforePair,await matrix(mobile),30,-20,viewport);
    await action(mobile,'recenter');
    await waitMatrix(mobile,beforePair);
    await checkFree(mobile,true);
    await tab(mobile,'session');assert.equal(await mobile.locator('#sessionExport').isVisible(),true);await close(mobile);
    await action(mobile,'interiorStart');await fullCanvas(mobile);
    assert.equal(await mobile.locator('#interiorHud').isVisible(),true);
    await mobile.screenshot({path:'artifacts/'+name+'-interior.png'});
    await action(mobile,'freeCamera');
    await tab(mobile,'systems');await fullCanvas(mobile);
    assert.equal(await mobile.locator('[data-screen="systems"]').isVisible(),true);
    assert.equal(await mobile.locator('[data-screen="settings"]').first().isVisible(),false);
    await mobile.screenshot({path:'artifacts/'+name+'-menu.png'});
    await close(mobile);
    await tab(mobile,'flight');await mobile.locator('#pilot').click();
    await fullCanvas(mobile);
    assert.equal(await mobile.locator('#flightPanel').isVisible(),true);
    await mobile.waitForFunction(()=>document.querySelector('#dockVector').textContent.includes('X-'));
    assert.equal(await mobile.locator('#precision').isVisible(),true);
    await mobile.screenshot({path:'artifacts/'+name+'-pilot.png'});
    await mobile.locator('#flightCollapse').click();assert.equal(await mobile.locator('#flightPanel').isVisible(),false);
    await mobile.locator('#pilotQuick').click();assert.equal(await mobile.locator('#flightPanel').isVisible(),true);
    await mobile.locator('#cleanView').click();
    assert.equal(await mobile.locator('#menuOpen').isVisible(),false);
    assert.equal(await mobile.locator('#flightPanel').isVisible(),false);
    assert.equal(await mobile.locator('#sceneHud').isVisible(),false);
    await fullCanvas(mobile);
    await mobile.screenshot({path:'artifacts/'+name+'-clean.png'});
    await mobile.locator('#cleanView').click();
    assert.equal(await mobile.locator('#menuOpen').isVisible(),true);
    assert.equal(await mobile.locator('#flightPanel').isVisible(),true);
    await tab(mobile,'settings');await mobile.locator('#camera').selectOption('orbit');await close(mobile);
    const session=await mobile.context().newCDPSession(mobile);
    const x=Math.round(viewport.width*.35),y=Math.round(viewport.height*.65);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*12}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await mobile.evaluate(()=>scrollY),0,'Touch does not scroll document');
    await tab(mobile,'mission');assert.equal(await mobile.locator('#restart').isVisible(),true);
    await close(mobile);await mobile.close();
  }
  const shaderPage=await setup({width:540,height:420});await compareEarthShaders(shaderPage);await shaderPage.close();
  const fallback=await setup({width:760,height:440},false,true);
  await compareRenderPaths(fallback,true);await fallback.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: real WebGL, Earth maps, simulation, docking, full viewport, contextual menus, portrait and landscape clean modes');
}finally{await browser.close();}
