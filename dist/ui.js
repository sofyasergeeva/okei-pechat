(function(){
const paths={arrow:'M5 19 19 5M5 5h14v14',clock:'M12 8v5l3 2',check:'m7 12 3 3 7-7',message:'M20 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 18 0Z',file:'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6ZM14 3v6h6M8 13h8m-8 4h6',home:'m3 10 9-7 9 7v10H5V10M9 20v-7h6v7',printer:'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7v-7ZM17 11h.01',shirt:'m8 3-5 4 3 4 2-1v11h8V10l2 1 3-4-5-4a4 4 0 0 1-8 0Z',orders:'m3 7 9-4 9 4-9 4-9-4Zm0 0v11l9 4 9-4V7M12 11v11',user:'M6 21v-3a6 6 0 0 1 12 0v3',close:'m6 6 12 12M6 18 18 6',pause:'M9 7v10M15 7v10'};
function icon(name,cls=''){const circle=['clock','check','pause'].includes(name)?'<circle cx="12" cy="12" r="9"/>':name==='user'?'<circle cx="12" cy="7" r="4"/>':'';return '<svg class="ui-icon '+cls+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+circle+'<path d="'+(paths[name]||paths.file)+'"/></svg>'}
let current=null;const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function enter(el){if(el&&!reduced())el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:330,easing:'cubic-bezier(.22,1,.36,1)'})}
function transition(update){if(reduced()){update();return}current?.skipTransition?.();if(document.startViewTransition){try{current=document.startViewTransition(update);current.finished.catch(()=>{});return}catch{}}update();enter(document.querySelector('.c-content')||document.querySelector('#main'))}
window.OkeiUI={icon,transition,enter};
})();
