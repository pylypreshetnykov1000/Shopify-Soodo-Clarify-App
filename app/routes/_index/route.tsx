import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form } from "react-router";
import { demoEnabled } from "../../services/context.server";
import { Icon, Logo } from "../../ui/common";
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (demoEnabled()) throw redirect("/app");
  if (url.searchParams.has("shop")) throw redirect(`/app?${url.searchParams}`);
  return null;
}
export default function Landing() {
  return (
    <main className="landing">
      <div className="brand">
        <Logo size={26} />
        Soodo <span className="brand-tag">GEO</span>
      </div>
      <h1>Get your products found by search and AI assistants</h1>
      <p>
        Check what crawlers and shopping assistants can read about each product, then fix the gaps in order of
        impact.
      </p>
      <Form method="post" action="/auth/login">
        <label>
          Shopify store domain
          <input
            type="text"
            name="shop"
            required
            placeholder="your-store.myshopify.com"
            autoComplete="url"
          />
        </label>
        <button className="button primary">
          Connect your Shopify store <Icon name="arrow" size={16} />
        </button>
      </Form>
      <p className="muted">
        Scanning is read-only. Description changes are published only after you approve them, and every
        previous version is kept.
      </p>
    </main>
  );
}
