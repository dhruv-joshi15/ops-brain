import type {Metadata} from "next";
import "@xyflow/react/dist/style.css";
import "./styles.css";
export const metadata: Metadata = {title:"Ops Brain | Just Sortd", description:"The operating console for Just Sortd."};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:`try{const t=localStorage.getItem("ops-theme");if(t==="light")document.documentElement.dataset.theme=t;if(localStorage.getItem("ops-motion")==="reduce")document.documentElement.dataset.motion="reduce";}catch{}`}}/></head><body>{children}</body></html>;
}
