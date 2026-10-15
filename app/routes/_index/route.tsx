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
  return (
    <main className="landing">
      <div className="brand">soodo</div>
      <h1>Review your product information</h1>
      <p>
        Connect Shopify to check missing specifications and prepare description
        updates.
      </p>
      <Form method="post" action="/auth/login">
        <label className="field">
          <span>Shopify store domain</span>
          <input
            type="text"
            name="shop"
            required
            placeholder="your-store.myshopify.com"
            autoComplete="url"
          />
        </label>
        <button className="button primary">
          Connect your Shopify store <Icon name="arrow" />
        </button>
      </Form>
      <p className="muted">
        You approve each update before it is published. Previous descriptions
        are saved in Change history.
      </p>
    </main>
  );
}
