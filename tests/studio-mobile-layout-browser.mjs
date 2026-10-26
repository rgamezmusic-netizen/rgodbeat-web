import {selectFixtureBeat} from './helpers/studio-beat-browser.mjs';
// Actual local production UI, touch controls and small/landscape viewports.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.STUDIO_TEST_URL ?? 'http://127.0.0.1:3105';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const {chromium,webkit} = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
for (const [name,launcher] of [['chromium',chromium],['webkit',webkit]]) {
  if (process.env.STUDIO_TEST_BROWSER && process.env.STUDIO_TEST_BROWSER !== name) continue;
  const browser = await launcher.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
  try {
    for (const [width,height] of [[320,568],[390,844],[844,390],[768,1024]]) {
      const page = await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
      page.setDefaultTimeout(15000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>localStorage.setItem('rgodbeat_install_guide_hidden_v2','true'));
      await page.route('**/api/studio/access',r=>r.fulfill({json:{isDemo:true,isLoggedIn:false,hasActivePass:false,email:null,daysRemaining:0}}));
      await page.goto(base+'/studio');
      await selectFixtureBeat(page);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no page-wide horizontal overflow');
      for(const label of ['Grabador','Edición']) {
        const tab=page.getByRole('button',{name:label,exact:true});
        assert.ok(await tab.evaluate(button=>{
          const box=button.getBoundingClientRect();
          return [...button.querySelectorAll('svg,span')].filter(el=>el.getClientRects().length).every(el=>{
            const content=el.getBoundingClientRect();return content.left>=box.left-1 && content.right<=box.right+1;
          });
        }),`${label}: visible icon/text fits its touch button`);
      }
      await page.getByTitle('Reproducir (Espacio)',{exact:true}).tap();
      await page.getByTitle('Pausar (Espacio)',{exact:true}).tap();
      await page.getByRole('button',{name:'Edición',exact:true}).tap();
      await page.getByRole('button',{name:'PLAY',exact:true}).tap();
      await page.getByRole('button',{name:'PAUSA',exact:true}).tap();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'editor fits viewport');
      await page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').tap();
      await page.getByRole('button',{name:'Mis proyectos en la nube',exact:true}).tap();
      const gallery=page.getByRole('dialog',{name:'Mis proyectos en la nube'});
      await gallery.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
      assert.equal(await gallery.getByText('Espacio vacío',{exact:true}).count(),0,'guest gallery never invents empty cloud slots');
      await gallery.getByRole('button',{name:'Cerrar galería'}).tap();
      await page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').tap();
      await page.getByRole('button',{name:'Instalar App',exact:true}).tap();
      await page.getByRole('dialog',{name:'Instala RGodbeat Studio'}).waitFor();
      await page.getByRole('button',{name:'Cerrar tutorial'}).tap();
      if(process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({path:process.env.STUDIO_SCREENSHOT_DIR+'/'+name+'-'+width+'x'+height+'.png'});
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name} ${width}x${height}: Studio/editor fit; touch playback, gallery and installation menu reachable`);
      await page.close();
    }
  } finally {await browser.close();}
}
