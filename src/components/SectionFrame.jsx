import React from 'react';
import './SectionFrame.css';

// The same widget composition reflows at phone and tablet widths without scaling text.
export default function SectionFrame({id,children,background='#ffffff',theme}){
 return <section id={id} className="frame" style={{background}} data-theme={theme}><div className="frame__canvas">{children}</div></section>;
}
