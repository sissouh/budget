"use strict";
/* Mon budget Ar — PWA hors ligne.
   1) Tout est enregistré d'abord sur le téléphone (IndexedDB) : l'app marche sans Internet.
   2) Dès qu'il y a du réseau et une connexion Google, tout est recopié dans un Google Sheets
      « Mon budget Ar — données » de ton Drive (onglets Journal, Postes, Groupes…). */
{
/* ================= constantes et outils ================= */
// Budget de départ : postes seulement, montants à 0 (ce code est public).
// Les vrais montants se saisissent dans l'onglet Budget et restent sur le téléphone + Google Drive.
const DEF = [
 ["Revenu","Salaire banque",0,"mois"],["Revenu","Salaire Mvola",0,"mois"],["Revenu","Intérêt sur prêt",0,"mois"],
 ["Épargne","Fonds d'urgence",0,"mois",0,0,50],["Épargne","Projet",0,"mois",0,0,30],["Épargne","Long terme",0,"mois",0,0,20],
 ["Fixe","Loyer mensuel",0,"mois"],["Fixe","Repas hebdomadaire",0,"semaine"],["Fixe","Électricité",0,"mois"],["Fixe","Fibre",0,"mois"],
 ["Fixe","Cotisation familiale",0,"mois"],["Fixe","Abonnement salle",0,"mois"],["Fixe","Serviette hygiénique",0,"mois"],["Fixe","Gaz",0,"mois"],
 ["Variable","Sortie",0,"mois"],["Variable","Restos",0,"mois"],["Variable","Huile",0,"mois"],["Variable","Produits ménagers + Sousou",0,"mois"],
 ["Variable","Épices",0,"mois"],["Variable","Provisions mensuelles",0,"mois"],["Variable","Autre dépense (imprévu)",0,"mois"]
].map((d,i)=>({id:"p"+i,type:d[0],nom:d[1],montant:d[2],freq:d[3],...(d[0]==="Épargne"?{objectif:d[4],depart:d[5],part:d[6]}:{})}));
const COL={Revenu:"#1f9d55","Épargne":"#2563eb",Fixe:"#7c3aed",Variable:"#e07b00"},PAL=["#0891b2","#db2777","#65a30d","#a16207","#475569","#0d9488"];
const FREQ={mois:["par mois",1],semaine:["par semaine",52/12],"2mois":["tous les 2 mois",1/2],"3mois":["tous les 3 mois",1/3],an:["par an",1/12]};
const MOIS=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
// séparateur de milliers : espace insécable normale (bien visible, ne coupe jamais un nombre)
const NB="\u00a0";
const grp=d=>d.replace(/\B(?=(\d{3})+(?!\d))/g,NB);
const ar=n=>{const v=Math.round(n||0);return(v<0?"-":"")+grp(String(Math.abs(v)))+NB+"Ar"};
// valeur affichée dans un champ de saisie : « 1418259 » → « 1 418 259 »
const fi=v=>{const d=String(v??"").replace(/\D/g,"").replace(/^0+(?=\d)/,"");return d?grp(d):""};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mensuel=p=>Math.round((+p.montant||0)*(FREQ[p.freq]||FREQ.mois)[1]/100)*100;
const pad=n=>String(n).padStart(2,"0");
const today=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const parseAr=s=>Math.round(+String(s).replace(/[^\d,.-]/g,"").replace(",","."))||0;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const clone=o=>JSON.parse(JSON.stringify(o));
const app=document.getElementById("app");
const CLIENT_ID=((window.BUDGET_CONFIG||{}).clientId||"").trim();

/* ================= état ================= */
// L = ce qui est enregistré sur le téléphone ; S = état de l'écran
let L=null;
const S={postes:[],groupes:[],couleurs:{},add:{type:"Variable",freq:"mois"},mois:today().slice(0,7),vue:"mois",tx:[],ep:[],ready:false,form:{type:"Dépense",poste:null},sync:{state:"idle",msg:""}};
const P=id=>S.postes.find(p=>p.id===id);
const isDep=t=>t!=="Revenu"&&t!=="Épargne";
const col=t=>S.couleurs[t]||COL[t]||"#475569";
const sw=t=>`<span class="sw" style="background:${esc(col(t))}"></span>`;
const types=()=>["Revenu","Épargne",...S.groupes];
const lab=t=>t==="Revenu"?"Revenus":t==="Épargne"?"Poches d'épargne":t==="Fixe"?"Dépenses fixes":t==="Variable"?"Dépenses variables":"Dépenses – "+t;
function applyCfg(){S.postes=clone(L.cfg.postes);S.groupes=[...L.cfg.groupes];S.couleurs={...L.cfg.couleurs}}

/* ================= stockage sur le téléphone (IndexedDB) ================= */
const idb={
 db:null,
 open(){return this.db||(this.db=new Promise((res,rej)=>{const r=indexedDB.open("mon-budget-ar",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}))},
 async get(k){const db=await this.open();return new Promise((res,rej)=>{const r=db.transaction("kv").objectStore("kv").get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})},
 async set(k,v){const db=await this.open();return new Promise((res,rej)=>{const t=db.transaction("kv","readwrite");t.objectStore("kv").put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
};
async function persist(){try{await idb.set("etat",L)}catch(e){toast("Impossible d'enregistrer sur le téléphone : "+(e.message||e))}}

const store={
 emit(){S.tx=L.tx.filter(t=>t.mois===S.mois);S.ep=L.tx.filter(t=>t.type==="Épargne");render()},
 async add(t){L.tx.push(t);delete L.del[t.id];L.pending++;await persist();this.emit();syncSoon()},
 async del(id){L.tx=L.tx.filter(x=>x.id!==id);L.del[id]=Date.now();L.pending++;await persist();this.emit();syncSoon()},
 async saveConfig(c){L.cfg=clone(c);L.cfgTs=Date.now();L.pending++;await persist();syncSoon()}
};

async function boot(){
 try{L=await idb.get("etat")}catch(e){}
 if(!L)L={tx:[],del:{},cfg:{postes:DEF,groupes:["Fixe","Variable"],couleurs:{}},cfgTs:0,pending:0,sheetId:null,email:null,lastSync:0};
 try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
 try{const t=JSON.parse(localStorage.getItem("gtok")||"null");if(t&&t.e>Date.now()){G.token=t.t;G.exp=t.e}}catch(e){}
 applyCfg();S.ready=true;store.emit();syncSoon(300);
}

/* ================= Google : connexion ================= */
const G={token:null,exp:0,client:null,wait:null,lastAuto:0};
const SCOPE="https://www.googleapis.com/auth/drive.file";
const tokenOk=()=>G.token&&Date.now()<G.exp;
function initGis(){
 if(G.client||!CLIENT_ID||!(window.google&&google.accounts&&google.accounts.oauth2))return;
 G.client=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,
  callback:r=>{const w=G.wait;G.wait=null;if(!w)return;
   if(r.error)return w.rej(new Error(r.error_description||r.error));
   G.token=r.access_token;G.exp=Date.now()+((+r.expires_in||3600)-120)*1000;
   try{localStorage.setItem("gtok",JSON.stringify({t:G.token,e:G.exp}))}catch(e){}
   w.res()},
  error_callback:e=>{const w=G.wait;G.wait=null;if(w)w.rej(new Error(e&&e.type==="popup_closed"?"connexion annulée":"connexion impossible ("+(e&&e.type||"?")+")"))}});
}
window.onGisLoad=()=>{initGis();render()};
// à appeler pendant un appui (sinon le navigateur bloque la fenêtre Google)
function login(prompt){
 return new Promise((res,rej)=>{
  initGis();
  if(!G.client)return rej(new Error(navigator.onLine?"le service de connexion Google ne s'est pas chargé, recharge l'app":"pas de connexion Internet"));
  G.wait={res,rej};
  G.client.requestAccessToken({prompt,hint:L.email||undefined});
 });
}
async function connect(first){
 try{
  setSync("busy","Connexion à Google…");
  await login(first?"select_account":"");
  const me=await api("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)");
  L.email=me.user&&me.user.emailAddress||L.email;await persist();
  await sync();
 }catch(e){setSync("err",e.message||String(e))}
}
// reconnexion discrète quand l'utilisateur appuie sur Enregistrer et que l'accès a expiré (1 h)
function relogIfNeeded(){
 if(!CLIENT_ID||!L.email||tokenOk()||!navigator.onLine||Date.now()-G.lastAuto<10*60e3)return;
 G.lastAuto=Date.now();
 login("").then(()=>syncSoon(500)).catch(()=>{});
}
function logout(){
 try{if(G.token&&window.google)google.accounts.oauth2.revoke(G.token,()=>{})}catch(e){}
 G.token=null;G.exp=0;try{localStorage.removeItem("gtok")}catch(e){}
 L.email=null;persist();setSync("idle","");toast("Déconnecté de Google. Tes données restent sur ce téléphone.");
}
async function api(url,opt={}){
 if(!tokenOk())throw Object.assign(new Error("connexion Google expirée"),{auth:true});
 const r=await fetch(url,{...opt,headers:{Authorization:"Bearer "+G.token,"Content-Type":"application/json"}});
 if(r.status===401){G.token=null;throw Object.assign(new Error("connexion Google expirée"),{auth:true})}
 if(!r.ok){let m="erreur "+r.status;try{m=(await r.json()).error.message||m}catch(e){}throw new Error(m)}
 return r.status===204?null:r.json();
}

/* ================= Google Sheets : synchronisation ================= */
const SH="https://sheets.googleapis.com/v4/spreadsheets";
const SHEET_NAME="Mon budget Ar — données";
const TABS=[
 ["Journal",["Date","Poste","Type","Montant (Ar)","Note","Mois","ID","ID poste","Horodatage"]],
 ["Postes",["ID","Type","Nom","Montant","Fréquence","Objectif","Déjà épargné","% du surplus"]],
 ["Groupes",["Groupe","Couleur"]],
 ["Supprimés",["ID","Supprimé le (horodatage)"]],
 ["Réglages",["Clé","Valeur"]]
];
const COLS={Journal:"I",Postes:"H",Groupes:"B",Supprimés:"B",Réglages:"B"};
const serial=iso=>{const[y,m,d]=iso.split("-").map(Number);return Date.UTC(y,m-1,d)/864e5+25569};
function toISO(v){
 if(typeof v==="number"&&v>0){const d=new Date(Math.round((v-25569)*864e5));return d.getUTCFullYear()+"-"+pad(d.getUTCMonth()+1)+"-"+pad(d.getUTCDate())}
 const s=String(v||"").trim();let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return m[1]+"-"+pad(m[2])+"-"+pad(m[3]);
 m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(m)return m[3]+"-"+pad(m[2])+"-"+pad(m[1]);return null;
}
const hdr=v=>({userEnteredValue:{stringValue:v},userEnteredFormat:{textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}},backgroundColor:{red:.12,green:.22,blue:.39}}});
async function ensureSheet(){
 if(L.sheetId){try{await api(`${SH}/${L.sheetId}?fields=spreadsheetId`);return L.sheetId}catch(e){if(e.auth)throw e;L.sheetId=null}}
 // déjà créé depuis un autre appareil ?
 const q=encodeURIComponent(`name='${SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
 const f=await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&orderBy=createdTime`);
 if(f.files&&f.files.length){L.sheetId=f.files[0].id;await persist();return L.sheetId}
 const s=await api(SH,{method:"POST",body:JSON.stringify({
  properties:{title:SHEET_NAME,locale:"fr_FR",timeZone:"Indian/Antananarivo"},
  sheets:TABS.map(([title,h],i)=>({properties:{sheetId:i+1,title,gridProperties:{frozenRowCount:1}},data:[{startRow:0,startColumn:0,rowData:[{values:h.map(hdr)}]}]}))})});
 L.sheetId=s.spreadsheetId;await persist();
 const fmt=(c,type,pattern)=>({repeatCell:{range:{sheetId:1,startRowIndex:1,startColumnIndex:c,endColumnIndex:c+1},cell:{userEnteredFormat:{numberFormat:{type,pattern}}},fields:"userEnteredFormat.numberFormat"}});
 const width=(c,px)=>({updateDimensionProperties:{range:{sheetId:1,dimension:"COLUMNS",startIndex:c,endIndex:c+1},properties:{pixelSize:px},fields:"pixelSize"}});
 await api(`${SH}/${L.sheetId}:batchUpdate`,{method:"POST",body:JSON.stringify({requests:[fmt(0,"DATE","dd/mm/yyyy"),fmt(3,"NUMBER",'#,##0" Ar"'),width(1,220),width(4,220)]})});
 return L.sheetId;
}
function readRemote(vr){
 const [vj,vp,vg,vd,vs]=vr.map(v=>v.values||[]);
 let fix=false;
 const postes=vp.filter(r=>r[0]!==undefined&&r[0]!==""&&r[2]).map(r=>{
  const p={id:String(r[0]),type:String(r[1]||"Variable"),nom:String(r[2]),montant:+r[3]||0,freq:String(r[4]||"mois")};
  if(p.type==="Épargne"){p.objectif=+r[5]||0;p.depart=+r[6]||0;p.part=+r[7]||0}return p});
 const couleurs={};vg.forEach(r=>{if(r[0]&&r[1])couleurs[String(r[0])]=String(r[1])});
 const groupes=vg.map(r=>String(r[0]||"")).filter(g=>g&&g!=="Revenu"&&g!=="Épargne");
 const byName={};(postes.length?postes:L.cfg.postes).forEach(p=>byName[p.nom.toLowerCase()]=p);
 const byId={};(postes.length?postes:L.cfg.postes).forEach(p=>byId[p.id]=p);
 const tx=[];
 vj.forEach(r=>{const date=toISO(r[0]),m=+r[3];if(!date||!m)return;
  let pid=String(r[7]||""),type=String(r[2]||"");
  if(!pid){const p=byName[String(r[1]||"").toLowerCase()];if(!p)return;pid=p.id;fix=true}
  if(!type){type=(byId[pid]||{}).type||"Variable";fix=true}
  let id=String(r[6]||"");if(!id){id=uid();fix=true}
  tx.push({id,date,mois:date.slice(0,7),poste:pid,type,montant:m,note:String(r[4]||""),ts:+r[8]||0})});
 const del={};vd.forEach(r=>{if(r[0])del[String(r[0])]=+r[1]||1});
 const reg={};vs.forEach(r=>{if(r[0])reg[String(r[0])]=r[1]});
 return{postes,groupes,couleurs,tx,del,cfgTs:+reg.configTs||0,fix};
}
let syncing=false,again=false,timer=null;
function syncSoon(ms=1500){clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),ms);renderSync()}
async function sync(){
 if(!CLIENT_ID||!L.email){renderSync();return}
 if(!navigator.onLine){setSync("offline");return}
 if(!tokenOk()){setSync("auth");return}
 if(syncing){again=true;return}
 syncing=true;setSync("busy","Sauvegarde…");
 const p0=L.pending;
 try{
  const id=await ensureSheet();
  const ranges=TABS.map(([t])=>`${t}!A2:${COLS[t]}`);
  const got=await api(`${SH}/${id}/values:batchGet?${ranges.map(r=>"ranges="+encodeURIComponent(r)).join("&")}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  const R=readRemote(got.valueRanges);
  // fusion (calculée d'un coup, sans attente, pour ne rien perdre de ce qui est noté pendant la sauvegarde)
  const del={...R.del};for(const[k,v]of Object.entries(L.del))del[k]=Math.max(del[k]||0,v);
  const map=new Map();R.tx.forEach(t=>map.set(t.id,t));L.tx.forEach(t=>map.set(t.id,t));
  const merged=[...map.values()].filter(t=>!del[t.id]);
  const remoteIds=new Set(R.tx.map(t=>t.id));
  let cfgChanged=false;
  if(R.postes.length&&R.cfgTs>L.cfgTs){L.cfg={postes:R.postes,groupes:R.groupes.length?R.groupes:L.cfg.groupes,couleurs:R.couleurs};L.cfgTs=R.cfgTs;cfgChanged=true}
  const needWrite=L.pending>0||R.fix||!R.postes.length||L.cfgTs>R.cfgTs||merged.length!==R.tx.length||merged.some(t=>!remoteIds.has(t.id))||Object.keys(del).length!==Object.keys(R.del).length;
  L.tx=merged;L.del=del;
  if(cfgChanged)applyCfg();
  await persist();store.emit();
  if(needWrite)await writeAll(id);
  L.pending=Math.max(0,L.pending-p0);L.lastSync=Date.now();await persist();
  setSync("ok");
 }catch(e){
  if(e.auth)setSync("auth");else if(!navigator.onLine)setSync("offline");else setSync("err",e.message||String(e));
 }finally{syncing=false;if(again){again=false;syncSoon(200)}}
}
async function writeAll(id){
 const name={};L.cfg.postes.forEach(p=>name[p.id]=p.nom);
 const rows={
  Journal:[...L.tx].sort((a,b)=>(a.date+(a.ts||0)).localeCompare(b.date+(b.ts||0))).map(t=>[serial(t.date),name[t.poste]||"Poste supprimé",t.type,+t.montant||0,t.note||"",t.mois,t.id,t.poste,t.ts||0]),
  Postes:L.cfg.postes.map(p=>{const e=p.type==="Épargne";return[p.id,p.type,p.nom,+p.montant||0,p.freq||"mois",e?+p.objectif||0:"",e?+p.depart||0:"",e?+p.part||0:""]}),
  Groupes:[...L.cfg.groupes.map(g=>[g,L.cfg.couleurs[g]||""]),...["Revenu","Épargne"].filter(k=>L.cfg.couleurs[k]).map(k=>[k,L.cfg.couleurs[k]])],
  Supprimés:Object.entries(L.del).map(([k,v])=>[k,v]),
  Réglages:[["configTs",L.cfgTs],["Dernière sauvegarde",new Date().toLocaleString("fr-FR")]]
 };
 const data=Object.entries(rows).filter(([,v])=>v.length).map(([t,v])=>({range:`${t}!A2`,values:v}));
 if(data.length)await api(`${SH}/${id}/values:batchUpdate`,{method:"POST",body:JSON.stringify({valueInputOption:"RAW",data})});
 // efface les anciennes lignes en trop sous les données
 await api(`${SH}/${id}/values:batchClear`,{method:"POST",body:JSON.stringify({ranges:Object.entries(rows).map(([t,v])=>`${t}!A${v.length+2}:${COLS[t]}`)})});
}
function setSync(state,msg=""){S.sync={state,msg};renderSync()}
addEventListener("online",()=>syncSoon(500));
addEventListener("offline",()=>setSync("offline"));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.ready)syncSoon(800)});

function syncHTML(){
 const n=L?L.pending:0,att=n?` · ${n} modification${n>1?"s":""} en attente`:"";
 if(!CLIENT_ID)return`<div class="sync"><span><i class="dot"></i>Mode local : données sur ce téléphone uniquement</span></div>`;
 if(!L.email)return`<div class="sync"><span><i class="dot wait"></i>Pas encore sauvegardé sur Drive</span><button data-login="1">Connecter Drive</button></div>`;
 const st=S.sync.state;
 if(!navigator.onLine||st==="offline")return`<div class="sync"><span><i class="dot wait"></i>Hors ligne${att||" · tout est enregistré sur le téléphone"}</span></div>`;
 if(st==="busy")return`<div class="sync"><span><i class="dot wait"></i>${esc(S.sync.msg||"Sauvegarde…")}</span></div>`;
 if(st==="err")return`<div class="sync err"><span><i class="dot err"></i>Sauvegarde impossible : ${esc(S.sync.msg)}</span><button data-sync="1">Réessayer</button></div>`;
 if(st==="auth"||!tokenOk())return n?`<div class="sync"><span><i class="dot wait"></i>${n} modification${n>1?"s":""} à sauvegarder</span><button data-login="1">Sauvegarder</button></div>`
  :`<div class="sync"><span><i class="dot ok"></i>À jour sur Drive${L.lastSync?" · "+heure(L.lastSync):""}</span></div>`;
 return`<div class="sync"><span><i class="dot ${n?"wait":"ok"}"></i>${n?"Sauvegarde en attente"+att:"✓ Sauvegardé sur Drive"+(L.lastSync?" · "+heure(L.lastSync):"")}</span></div>`;
}
const heure=ts=>{const d=new Date(ts),j=new Date().toDateString()===d.toDateString();return(j?"":d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+" ")+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})};
function renderSync(){const el=document.getElementById("sync");if(el&&L)el.outerHTML=syncHTML().replace('<div class="sync','<div id="sync" class="sync')}

/* ================= calculs ================= */
function bilan(){
 const reel={};for(const t of S.tx)reel[t.poste]=(reel[t.poste]||0)+(+t.montant||0);
 const sum=(type,f)=>S.postes.filter(p=>p.type===type).reduce((a,p)=>a+f(p),0);
 const R=t=>S.tx.filter(x=>x.type===t).reduce((a,x)=>a+(+x.montant||0),0);
 const rev=R("Revenu"),ep=R("Épargne"),dep=S.groupes.reduce((a,g)=>a+R(g),0);
 return{reel,rev,ep,dep,reste:rev-ep-dep,pRev:sum("Revenu",mensuel),pEp:sum("Épargne",mensuel),pDep:S.groupes.reduce((a,g)=>a+sum(g,mensuel),0)};
}
const poches=()=>S.postes.filter(p=>p.type==="Épargne");
const solde=p=>(+p.depart||0)+S.ep.filter(t=>t.poste===p.id).reduce((a,t)=>a+(+t.montant||0),0);
const moisLabel=m=>MOIS[+m.slice(5)-1]+" "+m.slice(0,4);
function shiftMois(d){let[y,m]=S.mois.split("-").map(Number);m+=d;if(m<1){m=12;y--}if(m>12){m=1;y++}S.mois=y+"-"+pad(m);store.emit()}
function shiftAn(d){S.mois=(+S.mois.slice(0,4)+d)+S.mois.slice(4);store.emit()}
function statut(type,r,pv){
 if(type==="Revenu")return r===0?(pv?"En attente":""):r>=pv?"✓ Reçu":"Partiel · manque "+ar(pv-r);
 if(type==="Épargne")return r===0?(pv?"À verser":""):r>=pv?"✓ Versé":"Partiel · manque "+ar(pv-r);
 if(r>pv)return"Dépassé de "+ar(r-pv);
 if(!pv)return"";
 return r===pv?"✓ Budget atteint":"Reste "+ar(pv-r);
}
function bilanAn(y){
 const tx=L.tx.filter(t=>t.mois.slice(0,4)===y),reel={};
 for(const t of tx)reel[t.poste]=(reel[t.poste]||0)+(+t.montant||0);
 const months=MOIS.map((nom,i)=>{const m=y+"-"+pad(i+1),l=tx.filter(t=>t.mois===m);
  const R=f=>l.filter(f).reduce((a,x)=>a+(+x.montant||0),0);
  const rev=R(t=>t.type==="Revenu"),ep=R(t=>t.type==="Épargne"),dep=R(t=>S.groupes.includes(t.type));
  return{m,nom,rev,ep,dep,reste:rev-ep-dep,n:l.length}});
 return{months,reel};
}
const stat=(t,label,v,sub)=>`<div class="stat"><span class="k">${sw(t)}${label}</span><b>${ar(v)}</b>${sub!==undefined?`<small>prévu ${ar(sub)}</small>`:""}</div>`;
const segVue=()=>`<div class="seg two" role="tablist">${[["mois","Mois"],["annee","Année"]].map(([k,l])=>`<button type="button" role="tab" aria-selected="${S.vue===k}" data-vue="${k}" class="${S.vue===k?"on":""}">${l}</button>`).join("")}</div>`;

/* ================= vues ================= */
function vAccueil(){
 if(S.vue==="annee")return vAnnee();
 const b=bilan(),neg=b.reste<0;
 const groups=types().map(type=>{
  const rows=S.postes.filter(p=>p.type===type).map(p=>{
   const pv=mensuel(p),r=b.reel[p.id]||0,over=isDep(type)&&r>pv,pct=pv?Math.min(100,r/pv*100):(r?100:0),st=statut(type,r,pv);
   return`<button class="row${over?" over":""}" style="--c:${esc(col(type))}" data-add="${esc(p.id)}"><div class="l"><span class="n">${esc(p.nom)}</span><span class="v">${ar(r)}<small>/ ${ar(pv)}</small></span></div><div class="bar"><i style="width:${pct}%;background:${esc(col(type))}"></i></div>${st?`<div class="st">${esc(st)}</div>`:""}</button>`}).join("");
  return rows?`<h2>${sw(type)}${esc(lab(type))}</h2>${rows}`:""}).join("");
 const split=b.reste>0?poches().map(p=>`${esc(p.nom)} : <b>${ar(b.reste*(+p.part||0)/100)}</b>`).join(" · "):"";
 return`${segVue()}<div class="top"><button class="iconbtn" data-m="-1" aria-label="Mois précédent">‹</button><h1>${moisLabel(S.mois)}</h1><button class="iconbtn" data-m="1" aria-label="Mois suivant">›</button></div>
 <section class="hero${neg?" neg":""}"><div class="mute">${neg?"Dépassement ce mois-ci":"Reste du mois → à virer sur l'épargne"}</div>
 <div class="big">${ar(Math.abs(b.reste))}</div>
 <div class="mute">${neg?"À rattraper le mois prochain sur les variables, sans toucher à l'épargne.":b.reste>0?split:"Note tes revenus et dépenses pour voir ton reste."}</div>
 <div class="stats">${stat("Revenu","Revenus",b.rev,b.pRev)}${stat("Variable","Dépenses",b.dep,b.pDep)}${stat("Épargne","Épargne",b.ep,b.pEp)}</div>
 ${b.reste>0?`<button class="btn" id="virer">J'ai viré le surplus sur mes poches</button>`:""}</section>${groups}`;
}
function vAnnee(){
 const y=S.mois.slice(0,4),{months,reel}=bilanAn(y),cur=today().slice(0,7);
 const tot=k=>months.reduce((a,x)=>a+x[k],0);
 const surplus=months.reduce((a,x)=>a+Math.max(0,x.reste),0),depass=months.reduce((a,x)=>a+Math.max(0,-x.reste),0);
 const max=Math.max(1,...months.map(x=>Math.abs(x.reste)));
 const nb=y<cur.slice(0,4)?12:y>cur.slice(0,4)?0:+cur.slice(5);
 const mrows=months.map(x=>{const vide=!x.n,neg=x.reste<0,pct=Math.abs(x.reste)/max*100;
  return`<button class="row${neg?" over":""}" style="--c:${esc(neg?"var(--red)":col("Épargne"))}" data-goto="${x.m}"${vide&&x.m>cur?" disabled":""}><div class="l"><span class="n">${x.nom}</span><span class="v${neg?" neg":""}">${vide?"—":(neg?"−":"+")+ar(Math.abs(x.reste))}</span></div>
  ${vide?"":`<div class="bar"><i style="width:${pct}%;background:${neg?"var(--red)":esc(col("Épargne"))}"></i></div><div class="st">Revenus ${ar(x.rev)} · Dépenses ${ar(x.dep)} · Épargne ${ar(x.ep)}</div>`}</button>`}).join("");
 const groups=types().map(type=>{
  const rows=S.postes.filter(p=>p.type===type).map(p=>{
   const pv=mensuel(p)*nb,r=reel[p.id]||0,over=isDep(type)&&r>pv,pct=pv?Math.min(100,r/pv*100):(r?100:0),ecart=isDep(type)?pv-r:r-pv;
   return`<div class="row${over?" over":""}" style="--c:${esc(col(type))};cursor:default"><div class="l"><span class="n">${esc(p.nom)}</span><span class="v">${ar(r)}<small>/ ${ar(pv)}</small></span></div><div class="bar"><i style="width:${pct}%;background:${esc(col(type))}"></i></div><div class="st">Prévu sur l'année ${ar(mensuel(p)*12)}${nb&&(r||pv)?` · écart ${ecart<0?"−":"+"}${ar(Math.abs(ecart))}`:""}</div></div>`}).join("");
  return rows?`<h2>${sw(type)}${esc(lab(type))}</h2>${rows}`:""}).join("");
 return`${segVue()}<div class="top"><button class="iconbtn" data-y="-1" aria-label="Année précédente">‹</button><h1>Bilan ${y}</h1><button class="iconbtn" data-y="1" aria-label="Année suivante">›</button></div>
 <section class="hero"><div class="mute">Surplus cumulé de l'année</div><div class="big">${ar(surplus)}</div>
 <div class="mute">${depass?`<span class="warn">Dépassements : ${ar(depass)}</span>`:"Aucun dépassement cette année."}</div>
 <div class="stats">${stat("Revenu","Revenus",tot("rev"))}${stat("Variable","Dépenses",tot("dep"))}${stat("Épargne","Épargne",tot("ep"))}</div></section>
 <h2>Reste mois par mois</h2><p class="mute" style="margin-top:-4px">Touche un mois pour voir son détail.</p>${mrows}
 <h2 style="margin-bottom:0">Réel vs prévu par poste</h2><p class="mute" style="margin-top:4px">${nb?`Prévu à date : ${nb} mois (${nb===12?"année complète":"janvier → "+MOIS[nb-1].toLowerCase()}).`:"Année pas encore commencée."}</p>${groups}`;
}
function vSaisir(){
 const f=S.form,cats=f.type==="Dépense"?S.groupes:[f.type];
 const chips=cats.map(c=>`${cats.length>1?`<div class="grp">${esc(c==="Fixe"?"Fixes":c==="Variable"?"Variables":c)}</div>`:""}<div class="chips">${S.postes.filter(p=>p.type===c).map(p=>`<button type="button" class="chip${f.poste===p.id?" on":""}" style="--c:${esc(col(c))}" data-p="${esc(p.id)}" aria-pressed="${f.poste===p.id}"><span class="sw" style="background:${esc(col(c))}"></span>${esc(p.nom)}</button>`).join("")}</div>`).join("");
 return`<h1>Noter un mouvement</h1><form id="fs">
 <label class="f" for="mt">Montant (Ar)</label><input id="mt" class="amount" inputmode="numeric" autocomplete="off" placeholder="0" value="${esc(fi(f.montant))}">
 <div class="seg">${["Dépense","Revenu","Épargne"].map(t=>`<button type="button" data-t="${t}" class="${f.type===t?"on":""}">${t}</button>`).join("")}</div>
 ${chips}
 <label class="f">Date<input id="dt" type="date" value="${esc(f.date||today())}"></label>
 <label class="f">Note (facultatif)<input id="nt" value="${esc(f.note||"")}" placeholder="ex. courses Leader Price"></label>
 <button class="btn" id="save" ${f.poste?"":"disabled"}>Enregistrer</button></form>`;
}
function vHisto(){
 const list=[...S.tx].sort((a,b)=>(b.date+(b.ts||0)).localeCompare(a.date+(a.ts||0)));
 let last="";const rows=list.map(t=>{const p=P(t.poste),h=t.date!==last?`<div class="grp">${esc(new Date(t.date+"T12:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}))}</div>`:"";last=t.date;
  const sign=t.type==="Revenu"?"+":t.type==="Épargne"?"→ ":"−";
  return h+`<div class="tx" style="--c:${esc(col(t.type))}"><div class="d">${esc(p?p.nom:"Poste supprimé")}<small>${esc(t.note||t.type)}</small></div><div class="m" style="color:${t.type==="Revenu"||t.type==="Épargne"?esc(col(t.type)):"inherit"}">${sign}${ar(t.montant)}</div><button class="del" data-del="${esc(t.id)}" aria-label="Supprimer">×</button></div>`}).join("");
 return`<div class="top"><button class="iconbtn" data-m="-1" aria-label="Mois précédent">‹</button><h1>${moisLabel(S.mois)}</h1><button class="iconbtn" data-m="1" aria-label="Mois suivant">›</button></div>${rows||`<div class="empty">Rien de noté ce mois-ci.<br>Appuie sur le + jaune pour commencer.</div>`}`;
}
function vEpargne(){
 const ps=poches(),tot=ps.reduce((a,p)=>a+solde(p),0),obj=ps.reduce((a,p)=>a+(+p.objectif||0),0);
 const cards=ps.map(p=>{const s=solde(p),o=+p.objectif||0,pct=o?Math.min(100,s/o*100):0;
  return`<div class="card"><div class="l"><b>${esc(p.nom)}</b><span class="mute">${Math.round(pct)} %</span></div><div class="big">${ar(s)}</div><div class="bar"><i style="width:${pct}%;background:${esc(col("Épargne"))}"></i></div><div class="mute" style="margin-top:8px">Objectif ${ar(o)} · reste ${ar(Math.max(0,o-s))}<br>${ar(mensuel(p))}/mois · ${+p.part||0} % du surplus</div></div>`}).join("");
 return`<h1>Mon épargne</h1><p class="mute">On y met, on n'y touche plus : aucun retrait possible ici, c'est voulu.</p>
 <div class="card dark"><div>Total épargné</div><div class="big">${ar(tot)}</div><div style="opacity:.7;font-size:14px">sur un objectif de ${ar(obj)}</div></div>${cards}${histoEp()}`;
}
function histoEp(){
 const y=S.mois.slice(0,4),ps=poches();
 let cumul=ps.reduce((a,p)=>a+(+p.depart||0),0)+S.ep.filter(t=>t.mois.slice(0,4)<y).reduce((a,t)=>a+(+t.montant||0),0);
 const rows=MOIS.map((nom,i)=>{const m=y+"-"+pad(i+1),l=S.ep.filter(t=>t.mois===m);if(!l.length)return"";
  const v=l.reduce((a,t)=>a+(+t.montant||0),0);cumul+=v;
  const det=ps.map(p=>{const s=l.filter(t=>t.poste===p.id).reduce((a,t)=>a+(+t.montant||0),0);return s?`${esc(p.nom)} ${ar(s)}`:""}).filter(Boolean).join(" · ");
  return`<div class="tx nodel" style="--c:${esc(col("Épargne"))}"><div class="d">${nom}<small>${det}</small></div><div class="m" style="color:${esc(col("Épargne"))}">+${ar(v)}<small>solde ${ar(cumul)}</small></div></div>`}).join("");
 return`<div class="top" style="margin:28px 0 6px"><button class="iconbtn" data-y="-1" aria-label="Année précédente">‹</button><h2>Versements ${y}</h2><button class="iconbtn" data-y="1" aria-label="Année suivante">›</button></div>${rows||`<div class="empty" style="padding:20px 10px">Aucun versement noté en ${y}.</div>`}`;
}
function vReglages(){
 const sum=t=>S.postes.filter(p=>p.type===t).reduce((a,p)=>a+mensuel(p),0);
 const reste=sum("Revenu")-sum("Épargne")-S.groupes.reduce((a,g)=>a+sum(g),0);
 const parts=poches().reduce((a,p)=>a+(+p.part||0),0);
 const opt=v=>Object.entries(FREQ).map(([k,[l]])=>`<option value="${k}"${v===k?" selected":""}>${l}</option>`).join("");
 const A=S.add,tOpt=[...types().map(t=>[t,t==="Revenu"?"Revenu":t==="Épargne"?"Épargne (nouvelle poche)":t==="Fixe"?"Dépense fixe":t==="Variable"?"Dépense variable":"Dépense – "+t]),["__new","+ Nouveau groupe de dépenses…"]].map(([v,l])=>`<option value="${esc(v)}"${A.type===v?" selected":""}>${esc(l)}</option>`).join("");
 const form=`<div class="card" id="addf"><b>Ajouter une catégorie</b>
 <label class="f">Nom<input id="a-nom" value="${esc(A.nom||"")}" placeholder="ex. Transport, Freelance…"></label>
 <label class="f">Type<select id="a-type">${tOpt}</select></label>
 ${A.type==="__new"?`<label class="f">Nom du nouveau groupe<input id="a-grp" value="${esc(A.grp||"")}" placeholder="ex. Transport, Santé"></label>`:""}
 <div class="duo"><label class="f">Montant (Ar)<input id="a-mt" inputmode="numeric" value="${esc(fi(A.montant))}" placeholder="0"></label><label class="f">Fréquence<select id="a-fq">${opt(A.freq)}</select></label></div>
 ${A.type==="Épargne"?`<div class="duo"><label class="f">Objectif (Ar)<input id="a-obj" inputmode="numeric" value="${esc(fi(A.objectif))}"></label><label class="f">% du surplus<input id="a-part" inputmode="numeric" value="${esc(fi(A.part))}"></label></div>`:""}
 <button class="btn" id="addok">Ajouter</button></div>`;
 const grp=types().map(type=>`<div class="gh"><h2>${sw(type)}${esc(lab(type))}</h2><input type="color" data-col="${esc(type)}" value="${esc(col(type))}" aria-label="Couleur de ${esc(lab(type))}">${isDep(type)&&!S.postes.some(p=>p.type===type)?`<button class="del" data-rmg="${esc(type)}" aria-label="Supprimer ce groupe">×</button>`:""}</div>`+
  S.postes.filter(p=>p.type===type).map(p=>`<div class="set" data-id="${esc(p.id)}" style="--c:${esc(col(type))}">
   <div class="name"><label>Nom<input data-k="nom" value="${esc(p.nom)}"></label><button class="del" data-rm="${esc(p.id)}" aria-label="Supprimer ${esc(p.nom)}">×</button></div>
   <div class="duo"><label>Montant (Ar)<input data-k="montant" inputmode="numeric" value="${esc(fi(p.montant))}"></label><label>Fréquence<select data-k="freq">${opt(p.freq)}</select></label></div>
   <div class="eq">= ${ar(mensuel(p))} par mois</div>
   ${type==="Épargne"?`<div class="duo"><label>Objectif (Ar)<input data-k="objectif" inputmode="numeric" value="${esc(fi(p.objectif||0))}"></label><label>% du surplus<input data-k="part" inputmode="numeric" value="${esc(fi(p.part||0))}"></label></div>
   <label>Déjà épargné avant l'app (Ar)<input data-k="depart" inputmode="numeric" value="${esc(fi(p.depart||0))}"></label>`:""}</div>`).join("")+
  `<button class="btn ghost sm" data-new="${esc(type)}">+ Ajouter ${type==="Épargne"?"une poche":"un poste"}</button>`).join("");
 const sheet=L.sheetId?`<a class="btn ghost" href="https://docs.google.com/spreadsheets/d/${esc(L.sheetId)}/edit" target="_blank" rel="noopener">Ouvrir mon Google Sheets</a>`:"";
 const drive=!CLIENT_ID?`<p class="mute">L'app n'est pas encore reliée à Google (réglage <code>clientId</code> vide dans config.js) : tes données restent sur ce téléphone.</p>`
  :L.email?`<p class="mute">Connecté à <b>${esc(L.email)}</b>. Tout est recopié dans le Google Sheets « ${esc(SHEET_NAME)} » de ton Drive dès qu'il y a du réseau.</p>${sheet}<button class="btn ghost" data-sync="1">Sauvegarder maintenant</button><button class="btn ghost" id="logout">Se déconnecter de Google</button>`
  :`<p class="mute">Relie l'app à ton Google Drive pour sauvegarder tes données et les retrouver sur un autre appareil.</p><button class="btn" data-login="1">Connecter Google Drive</button>`;
 return`<h1>Mon budget prévu</h1>
 <div class="alloc">Reste à allouer : <b class="${reste!==0?"warn":""}">${ar(reste)}</b><div class="mute">${reste===0?"Chaque Ar a sa place.":reste>0?"Ajoute-le à une poche d'épargne pour que chaque Ar ait sa place.":"Ton budget prévu dépasse tes revenus : réduis les variables."}</div>
 ${parts!==100?`<div class="warn" style="margin-top:6px">Les % du surplus font ${parts} % au lieu de 100 %.</div>`:""}</div>
 ${grp}<button class="btn" id="savecfg">Enregistrer mon budget</button>
 <h2>Ajouter</h2>${form}
 <h2>Mes données</h2>${drive}
 <button class="btn ghost" id="cp">Copier les lignes (format Journal Excel)</button>`;
}

/* ================= rendu et actions ================= */
let view="accueil";
function render(){
 if(!S.ready)return;
 if(view==="reglages"){readSettings();readAdd()}
 const scroll=view==="saisir"?null:window.scrollY;
 const keep=view==="saisir"?{m:document.getElementById("mt")?.value,d:document.getElementById("dt")?.value,n:document.getElementById("nt")?.value}:null;
 if(keep&&keep.m!==undefined){S.form.montant=keep.m;S.form.date=keep.d;S.form.note=keep.n}
 const body=({accueil:vAccueil,saisir:vSaisir,historique:vHisto,epargne:vEpargne,reglages:vReglages}[view]||vAccueil)();
 app.innerHTML=syncHTML().replace('<div class="sync','<div id="sync" class="sync')+body;
 document.querySelectorAll("nav a").forEach(a=>{const on=a.dataset.v===view;a.classList.toggle("on",on);on?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current")});
 if(scroll!==null)window.scrollTo(0,scroll);
}
function route(){const h=location.hash.slice(1);view=["accueil","saisir","historique","epargne","reglages"].includes(h)?h:"accueil";if(view==="saisir"&&!S.form.date)S.form.date=today();render();if(view==="saisir")setTimeout(()=>document.getElementById("mt")?.focus(),50)}
let tt;function toast(msg,undo){document.querySelector(".toast")?.remove();clearTimeout(tt);const d=document.createElement("div");d.className="toast";d.setAttribute("role","status");const s=document.createElement("span");s.textContent=msg;d.append(s);if(undo){const b=document.createElement("button");b.textContent="Annuler";b.onclick=()=>{d.remove();undo()};d.append(b)}document.body.append(d);tt=setTimeout(()=>d.remove(),5000)}
async function addTx(posteId,montant,date,note){const p=P(posteId);const t={id:uid(),date,mois:date.slice(0,7),poste:posteId,type:p.type,montant,note:note||"",ts:Date.now()};await store.add(t);return t}
function readAdd(){const v=id=>document.getElementById(id)?.value;const A=S.add;if(!document.getElementById("a-nom"))return;A.nom=v("a-nom");A.type=v("a-type");A.montant=v("a-mt");A.freq=v("a-fq");A.grp=v("a-grp")??A.grp;A.objectif=v("a-obj")??A.objectif;A.part=v("a-part")??A.part}
function readSettings(){document.querySelectorAll(".set").forEach(el=>{const p=P(el.dataset.id);if(!p)return;el.querySelectorAll("[data-k]").forEach(i=>{const k=i.dataset.k;p[k]=k==="nom"||k==="freq"?i.value:parseAr(i.value)})})}
const cfgNow=()=>({postes:S.postes,groupes:S.groupes,couleurs:S.couleurs});
function csv(){const all=[...L.tx].sort((a,b)=>a.date.localeCompare(b.date));
 return"Date\tPoste\tDescription\tMontant\n"+all.map(t=>{const[y,m,d]=t.date.split("-");return[`${d}/${m}/${y}`,P(t.poste)?.nom||"Poste supprimé",(t.note||"").replace(/\s+/g," "),t.montant].join("\t")}).join("\n")}

app.addEventListener("click",async e=>{
 const el=e.target.closest("button");if(!el)return;
 if(el.id==="save"||el.id==="savecfg"||el.id==="addok")relogIfNeeded();
 if(el.dataset.login){connect(!L.email);return}
 if(el.dataset.sync){if(!tokenOk()&&L.email){connect(false);return}sync();return}
 if(el.id==="logout"){logout();return}
 if(el.dataset.m){shiftMois(+el.dataset.m);return}
 if(el.dataset.y){shiftAn(+el.dataset.y);return}
 if(el.dataset.vue){S.vue=el.dataset.vue;render();window.scrollTo(0,0);return}
 if(el.dataset.goto){S.mois=el.dataset.goto;S.vue="mois";store.emit();window.scrollTo(0,0);return}
 if(el.dataset.add){const p=P(el.dataset.add);S.form={type:isDep(p.type)?"Dépense":p.type,poste:p.id,date:today()};location.hash="saisir";return}
 if(el.dataset.t){S.form.type=el.dataset.t;S.form.poste=null;render();return}
 if(el.dataset.p){S.form.poste=el.dataset.p;render();return}
 if(el.id==="save"){e.preventDefault();const m=parseAr(document.getElementById("mt").value),d=document.getElementById("dt").value||today(),n=document.getElementById("nt").value.trim();
  if(m<=0){toast("Saisis un montant positif.");return}
  el.disabled=true;const t=await addTx(S.form.poste,m,d,n);S.form={type:S.form.type,poste:null,date:today()};if(t.mois!==S.mois){S.mois=t.mois;store.emit()}location.hash="accueil";toast(`${ar(m)} noté : ${P(t.poste).nom}`,()=>store.del(t.id));return}
 if(el.dataset.del){const t=S.tx.find(x=>x.id===el.dataset.del);if(!t)return;await store.del(t.id);toast("Ligne supprimée",()=>store.add({...t,id:uid(),ts:Date.now()}));return}
 if(el.id==="virer"){const b=bilan(),ps=poches();if(b.reste<=0)return;
  const d=S.mois===today().slice(0,7)?today():(()=>{const[y,m]=S.mois.split("-").map(Number);return S.mois+"-"+pad(new Date(y,m,0).getDate())})();
  const sh=document.createElement("div");sh.className="sheet";sh.innerHTML=`<div class="p" role="dialog" aria-label="Virer le surplus"><h2 style="margin-top:0">Virer ${ar(b.reste)} sur l'épargne</h2>${ps.map(p=>`<div class="tx nodel"><span>${esc(p.nom)}</span><b class="m">${ar(Math.round(b.reste*(+p.part||0)/100))}</b></div>`).join("")}<p class="mute">Fais d'abord les virements, puis confirme : ils seront notés au ${esc(d.split("-").reverse().join("/"))}.</p><button class="btn" data-ok>C'est fait, je confirme</button><button class="btn ghost" data-no>Pas encore</button></div>`;
  document.body.append(sh);sh.addEventListener("click",async ev=>{if(ev.target===sh||ev.target.closest("[data-no]"))sh.remove();if(ev.target.closest("[data-ok]")){relogIfNeeded();sh.remove();let left=b.reste;for(const[i,p]of ps.entries()){const v=i===ps.length-1?left:Math.round(b.reste*(+p.part||0)/100);left-=v;if(v>0)await addTx(p.id,v,d,"Surplus du mois")}toast("Surplus versé sur tes poches")}});return}
 if(el.dataset.rm){readSettings();readAdd();const p=P(el.dataset.rm);S.postes=S.postes.filter(x=>x.id!==p.id);render();toast(`« ${p.nom} » retiré (enregistre pour valider)`,()=>{S.postes.push(p);render()});return}
 if(el.dataset.new){readSettings();readAdd();const t=el.dataset.new;S.postes.push({id:"p"+uid(),type:t,nom:t==="Épargne"?"Nouvelle poche":"Nouveau poste",montant:0,freq:"mois",...(t==="Épargne"?{objectif:0,depart:0,part:0}:{})});render();return}
 if(el.id==="addok"){readSettings();readAdd();const A=S.add,nom=(A.nom||"").trim();let type=A.type;
  if(!nom){toast("Donne un nom à la catégorie.");return}
  if(type==="__new"){const g=(A.grp||"").trim();if(!g||["Revenu","Épargne"].includes(g)){toast("Donne un nom au nouveau groupe.");return}if(!S.groupes.includes(g)){S.groupes.push(g);if(!S.couleurs[g])S.couleurs[g]=PAL[(S.groupes.length-3+PAL.length)%PAL.length]}type=g}
  S.postes.push({id:"p"+uid(),type,nom,montant:parseAr(A.montant),freq:A.freq||"mois",...(type==="Épargne"?{objectif:parseAr(A.objectif),depart:0,part:parseAr(A.part)}:{})});
  S.add={type,freq:"mois"};await store.saveConfig(cfgNow());toast(`« ${nom} » ajouté`);render();return}
 if(el.dataset.rmg){readSettings();S.groupes=S.groupes.filter(g=>g!==el.dataset.rmg);render();toast("Groupe retiré (enregistre pour valider)");return}
 if(el.id==="savecfg"){readSettings();await store.saveConfig(cfgNow());toast("Budget enregistré");render();return}
 if(el.id==="cp"){try{await navigator.clipboard.writeText(csv());toast("Lignes copiées : colle-les dans le Journal Excel")}catch(err){toast("Copie impossible sur cet appareil.")}return}
});
app.addEventListener("submit",e=>e.preventDefault());
// formatage en direct des montants pendant la saisie, sans faire sauter le curseur
app.addEventListener("input",e=>{const i=e.target;if(!i.matches||!i.matches("input[inputmode=numeric]"))return;
 const pos=i.selectionStart??i.value.length,avant=i.value.slice(0,pos).replace(/\D/g,"").length,v=fi(i.value);if(v===i.value)return;
 i.value=v;let n=0,k=0;while(k<v.length&&n<avant){if(/\d/.test(v[k]))n++;k++}try{i.setSelectionRange(k,k)}catch(err){}});
app.addEventListener("change",e=>{if(e.target.matches(".set select")||e.target.id==="a-type"||e.target.id==="a-fq"){readSettings();readAdd();render()}if(e.target.dataset.col){readSettings();readAdd();S.couleurs={...S.couleurs,[e.target.dataset.col]:e.target.value};render();toast("Couleur changée (enregistre pour la garder)")}});
window.addEventListener("hashchange",route);
route();boot();
}
