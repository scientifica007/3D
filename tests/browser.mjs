import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
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
async function setup(viewport,mobile=false){
  const page=await browser.newPage({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.addInitScript(()=>{
    const proto=WebGLRenderingContext.prototype, names=new WeakMap();
    const get=proto.getUniformLocation,set=proto.uniformMatrix4fv,set3=proto.uniform3fv;
    proto.getUniformLocation=function(program,name){const result=get.call(this,program,name);if(result)names.set(result,name);return result;};
    proto.uniformMatrix4fv=function(location,transpose,value){if(names.get(location)==='uVP')window.__testVP=Array.from(value);return set.call(this,location,transpose,value);};
    proto.uniform3fv=function(location,value){if(names.get(location)==='uEye'){window.__testEye=Array.from(value);window.__testFrame=(window.__testFrame||0)+1;}return set3.call(this,location,value);};
  });
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
  await page.waitForFunction(()=>window.__testEye[2]<5.92,{},{timeout:15000});
  await page.waitForTimeout(800);await page.keyboard.up('w');
  assert.ok((await cameraEye(page))[2]>5.82,'Closed door stops actual camera');
  assert.match(await page.locator('#interiorPrompt').textContent(),/فتح/);
  await page.locator('#interiorAction').click();await nextFrame(page);
  await page.locator('#gl').focus();await page.keyboard.down('w');
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
function checkPan(before,after,dx,dy,viewport){
  assert.ok(before.slice(0,12).every((v,i)=>Math.abs(v-after[i])<1e-5),'Pan preserves rotation and projection');
  const project=m=>[viewport.width*(.5+.5*m[12]/m[15]),viewport.height*(.5-.5*m[13]/m[15])];
  const a=project(before),b=project(after);
  assert.ok(Math.abs(b[0]-a[0]-dx)<3,'Horizontal screen displacement matches gesture');
  assert.ok(Math.abs(b[1]-a[1]-dy)<3,'Vertical screen displacement matches gesture');
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
  await action(page,'play');const battery=await page.locator('#battery').textContent();await page.waitForTimeout(500);assert.equal(await page.locator('#battery').textContent(),battery);
  await tab(page,'mission');await page.locator('#restart').click();assert.equal(await page.locator('#progress').textContent(),'0 / 4');
  await tab(page,'settings');await page.locator('#quality').selectOption('cinema');await close(page);await page.waitForTimeout(300);await page.screenshot({path:'artifacts/cinema.png'});
  await tab(page,'settings');await page.locator('#quality').selectOption('low');
  await tab(page,'flight');await page.locator('#pilot').click();assert.equal(await page.locator('#pilot').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#commandPanel').isVisible(),false);
  await fullCanvas(page);
  await page.locator('#flightCollapse').click();assert.equal(await page.locator('#flightPanel').isVisible(),false);await page.locator('#pilotQuick').click();assert.equal(await page.locator('#flightPanel').isVisible(),true);
  await page.locator('#autodock').click();await page.waitForFunction(()=>document.querySelector('#flightMessage').textContent.includes('التحام ناجح'),{},{timeout:60000});
  await page.screenshot({path:'artifacts/docking.png'});
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
  assert.deepEqual(errors,[]);
  console.log('PASS: real WebGL, Earth maps, simulation, docking, full viewport, contextual menus, portrait and landscape clean modes');
}finally{await browser.close();}
