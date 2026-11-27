import {db,auth,json,handle,authUser,safeId,HttpError,isAdminEmail} from './_lib.mjs';
// POST {action:'setRole'|'suspend'|'unsuspend'|'approveDeveloper'|'rejectDeveloper', uid, role?}  (admin only)
export default req=>handle(async()=>{
 if(req.method!=='POST')throw new HttpError(405,'POST only');const a=await authUser(req,{admin:true}),b=await req.json().catch(()=>({}));
 if(!/^[A-Za-z0-9]{6,128}$/.test(b.uid||''))throw new HttpError(400,'Bad uid');const ref=db().ref('users/'+b.uid);
 if(!(await ref.get()).exists())throw new HttpError(404,'User not found');
 const tEmail=(await ref.child('email').get()).val();if(isAdminEmail(tEmail)&&['suspend','setRole','rejectDeveloper'].includes(b.action))throw new HttpError(400,'The owner admin account cannot be changed');
 if(b.uid===a.uid&&['suspend','setRole','rejectDeveloper'].includes(b.action))throw new HttpError(400,'You cannot change your own role or status');
 if(b.action==='setRole'){if(!['user','developer','admin'].includes(b.role))throw new HttpError(400,'Bad role');await ref.child('role').set(b.role);await auth().setCustomUserClaims(b.uid,{role:b.role})}
 else if(b.action==='suspend'){await ref.child('suspended').set(true);await auth().updateUser(b.uid,{disabled:true});await auth().revokeRefreshTokens(b.uid)}
 else if(b.action==='unsuspend'){await ref.child('suspended').set(false);await auth().updateUser(b.uid,{disabled:false})}
 else if(b.action==='approveDeveloper'||b.action==='rejectDeveloper'){const ok=b.action==='approveDeveloper';
  if(!(await db().ref('developerApplications/'+b.uid).get()).exists())throw new HttpError(404,'No application');
  await db().ref('developerApplications/'+b.uid+'/status').set(ok?'approved':'rejected');if(ok){await ref.child('role').set('developer');await auth().setCustomUserClaims(b.uid,{role:'developer'})}
  await ref.child('developerStatus').set(ok?'approved':'rejected');
  await db().ref(`users/${b.uid}/notifications`).push({text:ok?'Your developer application was approved!':'Your developer application was not approved.',read:false,at:Date.now()})}
 else throw new HttpError(400,'Unknown action');
 return json({ok:true})});
