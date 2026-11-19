export function Owner({name,compact=false,fallback="Unassigned"}:{
  name:string|null;compact?:boolean;fallback?:string;
}) {
  const label=name?.trim() || fallback;
  const normalized=name?.trim().normalize("NFC");
  const words=normalized?.split(/\s+/u) ?? [];
  const initials=words.length>1
    ? [words[0],words[words.length-1]].map(word=>Array.from(word)[0]).join("")
    : Array.from(words[0]??"?").slice(0,2).join("");
  const tone=normalized ? Array.from(normalized.toLowerCase()).reduce((hash,char)=>(hash*31+char.codePointAt(0)!)%7,0) : "neutral";
  return <span className={`owner ${compact?"owner-compact":""}`}>
    <span className={`owner-avatar owner-tone-${tone}`} aria-hidden="true">{initials.toLocaleUpperCase()}</span>
    <span className="owner-name">{label}</span>
  </span>;
}
