import React from 'react';
/** Flag emoji are not rendered on Windows, so country marks are drawn as SVG. */
const codes:Record<string,string>={'США':'us','Германия':'de','Испания':'es','Австралия':'au','Великобритания':'gb','ОАЭ':'ae'};
const shapes:Record<string,React.ReactNode>={
 us:<><rect width="21" height="15" fill="#f4f5f7"/>{[0,2,4,6,8,10,12].map(i=><rect key={i} y={i*15/13} width="21" height={15/13} fill="#c9313c"/>)}<rect width="9" height={15*7/13} fill="#28417c"/></>,
 de:<><rect width="21" height="5" fill="#20242c"/><rect y="5" width="21" height="5" fill="#c9313c"/><rect y="10" width="21" height="5" fill="#e9bb2c"/></>,
 es:<><rect width="21" height="15" fill="#c9313c"/><rect y="4" width="21" height="7" fill="#e9bb2c"/></>,
 au:<><rect width="21" height="15" fill="#28417c"/><rect width="10.5" height="7.5" fill="#22386b"/><path d="M0 0l10.5 7.5M10.5 0L0 7.5" stroke="#f4f5f7" strokeWidth="1.5"/><path d="M5.25 0v7.5M0 3.75h10.5" stroke="#f4f5f7" strokeWidth="2.6"/><path d="M5.25 0v7.5M0 3.75h10.5" stroke="#c9313c" strokeWidth="1.3"/><circle cx="15.5" cy="10" r="1.5" fill="#f4f5f7"/><circle cx="5" cy="12" r="1.1" fill="#f4f5f7"/></>,
 gb:<><rect width="21" height="15" fill="#28417c"/><path d="M0 0l21 15M21 0L0 15" stroke="#f4f5f7" strokeWidth="3"/><path d="M0 0l21 15M21 0L0 15" stroke="#c9313c" strokeWidth="1.5"/><path d="M10.5 0v15M0 7.5h21" stroke="#f4f5f7" strokeWidth="5"/><path d="M10.5 0v15M0 7.5h21" stroke="#c9313c" strokeWidth="2.6"/></>,
 ae:<><rect width="21" height="5" fill="#1e8b4d"/><rect y="5" width="21" height="5" fill="#f4f5f7"/><rect y="10" width="21" height="5" fill="#20242c"/><rect width="5.5" height="15" fill="#c9313c"/></>,
 xx:<><rect width="21" height="15" fill="#e6ebf3"/><circle cx="10.5" cy="7.5" r="4.6" fill="none" stroke="#9aa6ba"/><path d="M10.5 2.9v9.2M5.9 7.5h9.2" stroke="#9aa6ba"/></>
};
export const markets=Object.keys(codes);
export function Flag({market}:{market:string}){
 const code=codes[market]??'xx';
 return <svg className="flag" viewBox="0 0 21 15" width="19" height="14" role="img" aria-hidden="true" focusable="false">
  <clipPath id={`flag-${code}`}><rect width="21" height="15" rx="2.4"/></clipPath>
  <g clipPath={`url(#flag-${code})`}>{shapes[code]}</g>
  <rect x=".5" y=".5" width="20" height="14" rx="2" fill="none" stroke="#1a253a1f"/>
 </svg>;
}
