import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form } from "react-router";
import { demoEnabled } from "../../services/context.server";
import { Icon } from "../../ui/common";
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (demoEnabled()) throw redirect("/app");
  if (url.searchParams.has("shop")) throw redirect(`/app?${url.searchParams}`);
  return null;
}
export default function Landing() {
  return <main className="landing"><div className="brand"><span className="brand-mark"><Icon name="leaf"/></span>soodo.</div><div className="eyebrow">PRODUCT CLARITY FOR SHOPIFY</div><h1>A clearer catalog.<br/>A better discovery.</h1><p>Find missing product specifications, organize verified facts, and publish descriptions you can trust.</p><Form method="post" action="/auth/login"><label className="field"><span>Shopify store domain</span><input type="text" name="shop" required placeholder="your-store.myshopify.com" autoComplete="url"/></label><button className="button primary">Connect your Shopify store <Icon name="arrow"/></button></Form><p className="muted">Manual approval for every change. Saved snapshots for every publish.</p></main>;
}
