import {db,json,handle,authUser,safeId,HttpError} from './_lib.mjs';
// POST {projectId}. Recomputes DERIVED public fields (supported MC versions/platforms, version count, rating) of a published project.
// Safe for any signed-in user: values are computed server-side from stored data, never taken from the request.
export default req=>handle(async()=>{
 if(req.method!=='POST')throw new HttpError(405,'POST only');
 await authUser(req);const b=await req.json().catch(()=>({}));if(!safeId(b.projectId))throw new HttpError(400,'Bad request');
 const pid=b.projectId,pub=db().ref('projectsPublic/'+pid);if(!(await pub.get()).exists())return json({ok:true,published:false});
 const vs=(await db().ref('projectVersions/'+pid).get()).val()||{},mc={},platforms={};let latest=0,count=0;
 for(const v of Object.values(vs)){count++;for(const k of Object.keys(v.mc||{}))mc[k]=true;for(const k of Object.keys(v.platforms||{}))platforms[k]=true;latest=Math.max(latest,Number(v.createdAt)||0)}
 const rv=(await db().ref('reviews/'+pid).get()).val()||{},st=Object.values(rv).map(r=>Number(r.stars)||0).filter(Boolean);
 const rating=st.length?Math.round(st.reduce((a,c)=>a+c,0)/st.length*10)/10:0;
 const o={mc:Object.keys(mc).length?mc:null,platforms:Object.keys(platforms).length?platforms:null,versionCount:count,rating,reviewCount:st.length};
 if(latest)o.updatedAt=latest;
 await pub.update(o);return json({ok:true,published:true})});
