// Revision order, not the restored content's age, defines the current state.
export function restoreContext(project, versions) {
 const current=versions.find(v=>String(v.revision)===String(project.revision));
 const previous=current?.kind==='restore'?versions.find(v=>Number(v.revision)===Number(current.revision)-1):null;
 const source=current?.restored_from?versions.find(v=>String(v.id)===String(current.restored_from)):null;
 return {current,previous,source};
}

export function versionAtTime(versions, point) {
 const time=new Date(point).getTime();
 if(!Number.isFinite(time))return null;
 return versions.filter(v=>new Date(v.created_at).getTime()<=time)
  .sort((a,b)=>Number(b.revision)-Number(a.revision))[0]||null;
}

export function taipeiPoint(value) {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))throw Error('時間格式無效');
 const point=new Date(value+'+08:00');
 if(!Number.isFinite(point.getTime()))throw Error('時間格式無效');
 return point.toISOString();
}
